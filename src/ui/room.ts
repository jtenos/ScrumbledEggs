// Room page orchestrator. Subscribes to RTDB and re-renders on change; RTDB is the
// single source of truth. Handles join gate, voting, reveal flow, host tools, and modals.
import { el, mount, truncateName } from '../util/dom';
import { header } from './header';
import { ensureAuth } from '../auth';
import { isBanned, setBanned } from '../util/cookies';
import {
  subscribeRoom,
  updateRoomName,
  setAutoReveal,
  setObserver,
  kickUser,
  reassignHost,
  setVote,
  resetVotes,
  revealRound,
  setOverride,
  requestReveal,
  cancelReveal,
  clearRevealRequest,
  enqueueStory,
  nextRound,
} from '../db/rooms';
import { buildDeckModel, computeScores } from '../scoring';
import type { Room, Participant, RoundStatus } from '../types';
import { renderJoin } from './join';
import { renderBoard } from './board';
import { renderResults } from './results';
import { renderExpired, renderNotFound, renderRemoved } from './expired';
import { preloadGifs, showCelebrate, showSpread, showWaiting } from './modals';
import { roomUrl } from '../router';
import { copyToClipboard, qrDataUrl } from '../util/share';
import { buildResultsHtml, downloadHtml, type StorySection } from '../util/download';

export async function renderRoom(root: HTMLElement, roomId: string): Promise<void> {
  preloadGifs();
  const uid = await ensureAuth();

  if (isBanned(roomId)) {
    renderRemoved(root);
    return;
  }

  // --- cross-snapshot state ---
  let joinRendered = false;
  let wasJoined = false;
  let kicked = false;
  let layoutMounted = false;
  let prevRoundId: string | null = null;
  let prevStatus: RoundStatus | null = null;
  let waitingShown = false;
  let autoRevealedRound: string | null = null;
  let pendingRequest = false;
  let revealTimer: ReturnType<typeof setTimeout> | null = null;
  let sharePanelOpen = false;

  const headerEl = header();
  const content = el('div', { class: 'stack' });

  const unsub = subscribeRoom(roomId, (room) => {
    if (kicked) return;
    if (!room || !room.meta) {
      renderNotFound(root);
      return;
    }
    if (room.meta.status === 'expired') {
      renderExpired(root);
      return;
    }

    const me = room.participants?.[uid];

    // I was in the room and now I'm gone → host kicked me.
    if (wasJoined && !me) {
      kicked = true;
      setBanned(roomId);
      if (revealTimer) clearTimeout(revealTimer);
      unsub();
      renderRemoved(root);
      return;
    }

    if (!me) {
      if (!joinRendered) {
        joinRendered = true;
        const taken = new Set(Object.values(room.participants ?? {}).map((p) => p.icon));
        void renderJoin(root, roomId, taken, () => {
          /* the next snapshot (with me present) re-renders the room */
        });
      }
      return;
    }

    wasJoined = true;
    if (!layoutMounted) {
      mount(root, el('div', { class: 'wrap stack' }, [headerEl, content]));
      layoutMounted = true;
    }
    handleSideEffects(room, me);
    renderRoomView(room, me);
  });

  // ---------- side effects: modals, auto-reveal, reveal-request resolution ----------
  function handleSideEffects(room: Room, me: Participant): void {
    const meta = room.meta;
    const roundId = meta.currentRoundId;
    const round = room.rounds?.[roundId];
    if (!round) return;
    const model = buildDeckModel(meta.deck);
    const scores = computeScores(model, round.votes ?? {});

    if (roundId !== prevRoundId) {
      prevStatus = null;
      waitingShown = false;
    }

    // Requester: host vetoed my reveal request.
    if (pendingRequest && meta.revealRequest?.cancelled) {
      if (revealTimer) clearTimeout(revealTimer);
      pendingRequest = false;
      void clearRevealRequest(roomId);
      alert('The host has cancelled your reveal request');
    }

    // Reveal transition → celebrate / spread (mutually exclusive).
    if (round.status === 'revealed' && prevStatus !== 'revealed') {
      if (scores.consensus) showCelebrate();
      else if (scores.spread) showSpread();
    }

    const activeVoters = Object.entries(room.participants ?? {}).filter(
      ([, p]) => p.connected && !p.isObserver
    );

    // Auto-reveal once every active voter has voted.
    if (meta.autoReveal && round.status === 'voting' && autoRevealedRound !== roundId) {
      const allVoted = activeVoters.length > 0 && activeVoters.every(([u]) => round.voted?.[u]);
      if (allVoted) {
        autoRevealedRound = roundId;
        void revealRound(roomId, roundId);
      }
    }

    // "Waiting on you" nudge — only I haven't voted.
    const iAmActiveVoter = me.connected && !me.isObserver;
    if (round.status === 'voting' && iAmActiveVoter && !round.voted?.[uid]) {
      const others = activeVoters.filter(([u]) => u !== uid);
      if (others.length >= 1 && others.every(([u]) => round.voted?.[u]) && !waitingShown) {
        waitingShown = true;
        showWaiting();
      }
    } else {
      waitingShown = false;
    }

    prevRoundId = roundId;
    prevStatus = round.status;
  }

  // ---------- main render ----------
  function renderRoomView(room: Room, me: Participant): void {
    const meta = room.meta;
    const roundId = meta.currentRoundId;
    const round = room.rounds?.[roundId];
    if (!round) return;
    const isHost = meta.hostUid === uid;
    const revealed = round.status === 'revealed';
    const model = buildDeckModel(meta.deck);
    const scores = computeScores(model, round.votes ?? {});

    // Room name (editable by host) + story subtitle.
    const nameEl = el('h1', { class: 'room-name', text: meta.name });
    if (isHost) {
      nameEl.contentEditable = 'true';
      nameEl.addEventListener('blur', () => {
        const v = nameEl.textContent?.trim() || meta.name;
        if (v !== meta.name) void updateRoomName(roomId, v);
      });
    }
    const head = el('div', {}, [nameEl, el('p', { class: 'story-subtitle', text: round.title || 'Untitled story' })]);

    // Reveal-request banner (host sees a non-host request with a veto).
    let banner: HTMLElement | false = false;
    const req = meta.revealRequest;
    if (isHost && req && !req.cancelled && req.byUid !== uid) {
      const cancelBtn = el('button', { class: 'danger', text: 'Cancel' });
      cancelBtn.addEventListener('click', () => void cancelReveal(roomId));
      banner = el('div', { class: 'card row' }, [
        el('span', { text: `${truncateName(req.byName)} requested to reveal scores…` }),
        cancelBtn,
      ]);
    }

    // Board + results placement.
    const boardEl = el('div', { class: 'board' });
    const resultsEl = revealed
      ? renderResults({
          scores,
          round,
          isHost,
          overrideChoices: model.baseValues,
          onSetOverride: (v) => void setOverride(roomId, roundId, v),
          onClearOverride: () => void setOverride(roomId, roundId, null),
          onReset: () => void resetVotes(roomId, roundId),
        })
      : null;

    const { resultsPlacedInCenter } = renderBoard(
      boardEl,
      room.participants ?? {},
      {
        myUid: uid,
        isHost,
        revealed,
        round,
        model,
        onKick: (u) => {
          if (confirm('Remove this participant?')) void kickUser(roomId, u);
        },
        onReassign: (u) => {
          if (confirm('Reassign host to this participant?')) void reassignHost(roomId, u);
        },
      },
      resultsEl
    );

    // Voting deck (hidden for spectators). Available even after reveal (votes are changeable).
    const deckEl = me.isObserver ? false : buildDeck(meta.deck, round.votes?.[uid] ?? null, (v) => void setVote(roomId, roundId, uid, v));

    const controls = buildControls(room, me, isHost, revealed, roundId);

    mount(
      content,
      head,
      banner,
      revealed && !resultsPlacedInCenter && resultsEl ? el('div', { class: 'results sticky' }, [resultsEl]) : false,
      boardEl,
      deckEl,
      controls
    );
  }

  // ---------- voting deck (egg cards) ----------
  function buildDeck(deck: string[], myVote: string | null, onPick: (v: string) => void): HTMLElement {
    const wrap = el('div', { class: 'deck' });
    for (const value of deck) {
      const label = el('div', { class: 'egg-label', text: value });
      // Shrink font so the value fits inside the egg.
      label.style.fontSize = value.length <= 1 ? '1.6rem' : value.length === 2 ? '1.3rem' : value.length === 3 ? '1rem' : '0.8rem';
      const card = el('button', { class: 'egg-card' + (value === myVote ? ' selected' : '') }, [
        el('img', { src: '/img/egg.webp', alt: '' }),
        label,
      ]);
      card.addEventListener('click', () => onPick(value));
      wrap.append(card);
    }
    return wrap;
  }

  // ---------- control bar ----------
  function buildControls(
    room: Room,
    me: Participant,
    isHost: boolean,
    revealed: boolean,
    roundId: string
  ): HTMLElement {
    const meta = room.meta;
    const bar = el('div', { class: 'card stack' });
    const row = el('div', { class: 'row' });

    // Show Votes (anyone, while voting).
    if (!revealed) {
      const showBtn = el('button', { class: 'primary', text: 'Show Votes' });
      showBtn.addEventListener('click', () => {
        if (isHost) {
          void revealRound(roomId, roundId);
        } else {
          pendingRequest = true;
          void requestReveal(roomId, {
            byUid: uid,
            byName: me.name,
            requestedAt: Date.now(),
            cancelled: false,
          });
          revealTimer = setTimeout(() => {
            if (pendingRequest) {
              pendingRequest = false;
              void revealRound(roomId, roundId);
              void clearRevealRequest(roomId);
            }
          }, 3000);
        }
      });
      row.append(showBtn);
    }

    // Spectator toggle (self only).
    const specBtn = el('button', { text: me.isObserver ? 'Rejoin as voter' : 'Spectate only' });
    specBtn.addEventListener('click', () => void setObserver(roomId, uid, !me.isObserver));
    row.append(specBtn);

    // Share link + QR.
    const shareBtn = el('button', { text: 'Share' });
    const sharePanel = el('div', { class: 'stack' + (sharePanelOpen ? '' : ' hidden') });
    shareBtn.addEventListener('click', () => {
      sharePanelOpen = !sharePanelOpen;
      sharePanel.classList.toggle('hidden', !sharePanelOpen);
      if (sharePanelOpen) void fillShare(sharePanel);
    });
    row.append(shareBtn);

    // Downloads (everyone).
    if (revealed) {
      const dlOne = el('button', { text: 'Download Results' });
      dlOne.addEventListener('click', () => {
        const section = sectionFor(room, roundId);
        if (section) downloadHtml('story-results.html', buildResultsHtml(section.title || 'Story results', [section]));
      });
      row.append(dlOne);
    }
    const dlAll = el('button', { text: 'Download Session' });
    dlAll.addEventListener('click', () => {
      const sections = buildSessionSections(room);
      downloadHtml('session-results.html', buildResultsHtml(meta.name, sections));
    });
    row.append(dlAll);

    bar.append(row);

    // Host-only controls.
    if (isHost) {
      const hostRow = el('div', { class: 'row' });

      const nextBtn = el('button', { class: 'primary', text: 'Next Round' });
      nextBtn.addEventListener('click', () => {
        const hasQueued = Object.values(room.rounds ?? {}).some((r) => r.status === 'queued');
        if (hasQueued) {
          void nextRound(roomId, '');
        } else {
          const title = prompt('Name the next story:');
          if (title !== null) void nextRound(roomId, title.trim());
        }
      });
      hostRow.append(nextBtn);

      const enqueueBtn = el('button', { text: 'Enqueue Story' });
      enqueueBtn.addEventListener('click', () => {
        const title = prompt('Story to enqueue:');
        if (title && title.trim()) void enqueueStory(roomId, title.trim());
      });
      hostRow.append(enqueueBtn);

      const resetBtn = el('button', { text: 'Reset Votes' });
      resetBtn.addEventListener('click', () => void resetVotes(roomId, roundId));
      hostRow.append(resetBtn);

      const autoCb = el('input', { type: 'checkbox' }) as HTMLInputElement;
      autoCb.checked = meta.autoReveal;
      autoCb.addEventListener('change', () => void setAutoReveal(roomId, autoCb.checked));
      hostRow.append(el('label', { class: 'toggle' }, [autoCb, el('span', { text: 'Auto-reveal' })]));

      bar.append(hostRow);

      // Queue (host only).
      const queued = Object.entries(room.rounds ?? {})
        .filter(([, r]) => r.status === 'queued')
        .sort(([a], [b]) => (a < b ? -1 : 1));
      if (queued.length > 0) {
        bar.append(
          el('div', { class: 'stack' }, [
            el('span', { class: 'muted', text: `Queued stories (${queued.length}):` }),
            el('ol', {}, queued.map(([, r]) => el('li', { text: r.title || 'Untitled' }))),
          ])
        );
      }
    }

    bar.append(sharePanel);
    return bar;
  }

  async function fillShare(panel: HTMLElement): Promise<void> {
    const url = roomUrl(roomId);
    const copyBtn = el('button', { text: 'Copy link' });
    copyBtn.addEventListener('click', async () => {
      const ok = await copyToClipboard(url);
      copyBtn.textContent = ok ? 'Copied!' : 'Copy failed';
      setTimeout(() => (copyBtn.textContent = 'Copy link'), 1500);
    });
    mount(
      panel,
      el('div', { class: 'row' }, [el('input', { value: url, readonly: true, style: 'flex:1' }), copyBtn])
    );
    try {
      const dataUrl = await qrDataUrl(url);
      panel.append(el('img', { src: dataUrl, alt: 'Room QR code', style: 'width:200px' }));
    } catch {
      /* QR optional */
    }
  }

  // ---------- download helpers ----------
  function sectionFor(room: Room, roundId: string): StorySection | null {
    const round = room.rounds?.[roundId];
    if (!round) return null;
    const model = buildDeckModel(room.meta.deck);
    const votes = round.votes ?? {};
    const scores = computeScores(model, votes);
    return {
      title: round.title,
      mean: scores.mean,
      median: scores.median,
      recommended: scores.recommended,
      override: round.overrideScore ?? null,
      votes: Object.entries(votes).map(([u, v]) => ({
        name: room.participants?.[u]?.name ?? u,
        vote: v,
      })),
    };
  }

  function buildSessionSections(room: Room): StorySection[] {
    return Object.entries(room.rounds ?? {})
      .filter(([, r]) => r.status === 'revealed')
      .sort(([, a], [, b]) => a.startedAt - b.startedAt)
      .map(([rid]) => sectionFor(room, rid))
      .filter((s): s is StorySection => s !== null);
  }
}
