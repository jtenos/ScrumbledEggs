// Participant board. Layout adapts to count + screen (CLAUDE.md → Responsive participant layout):
//  ≤9 circular poker table · 10–16 4×4 · 17–25 5×5 · 26+ name/score list · mobile = rows.
import { el, mount, truncateName } from '../util/dom';
import { iconUrl } from '../util/icons';
import { isSpecial } from '../types';
import type { Participant, Round } from '../types';
import type { DeckModel } from '../scoring';

export interface BoardCtx {
  myUid: string;
  isHost: boolean;
  revealed: boolean;
  round: Round;
  model: DeckModel;
  onKick: (uid: string) => void;
  onReassign: (uid: string) => void;
}

type Entry = [string, Participant];

function isMobile(): boolean {
  return window.matchMedia('(max-width: 640px)').matches;
}

/** Map each distinct real numeric value to a size bucket (s/m/l), capped at 3 tiers. */
function sizeClasses(round: Round, model: DeckModel): Map<string, string> {
  const out = new Map<string, string>();
  const values = Object.values(round.votes ?? {}).filter((v) => !isSpecial(v));
  const distinct = [...new Set(values)].sort(
    (a, b) => (model.toNumber.get(a) ?? 0) - (model.toNumber.get(b) ?? 0)
  );
  const n = distinct.length;
  distinct.forEach((v, i) => {
    if (n <= 1) out.set(v, 'size-m');
    else {
      const bucket = Math.min(2, Math.floor((i * 3) / n));
      out.set(v, ['size-s', 'size-m', 'size-l'][bucket]);
    }
  });
  return out;
}

function playerEl(uid: string, p: Participant, ctx: BoardCtx, sizes: Map<string, string>): HTMLElement {
  const hasVoted = !!ctx.round.voted?.[uid];
  const classes = ['player'];
  if (hasVoted && !ctx.revealed) classes.push('voted');
  if (!p.connected) classes.push('disconnected');

  const children: (HTMLElement | string | false)[] = [
    el('img', { class: 'avatar', src: iconUrl(p.icon), alt: p.name }),
    el('div', { class: 'pname', text: truncateName(p.name) + (p.isObserver ? ' 👁' : '') }),
  ];

  // Vote slot: only show the value once revealed.
  const voteEl = el('div', { class: 'vote' });
  if (ctx.revealed) {
    const v = ctx.round.votes?.[uid];
    if (v != null) {
      voteEl.textContent = v;
      if (isSpecial(v)) voteEl.classList.add('special');
      else voteEl.classList.add(sizes.get(v) ?? 'size-m');
    }
  } else if (hasVoted) {
    voteEl.textContent = '✓';
  }
  children.push(voteEl);

  // Host tools per other participant.
  if (ctx.isHost && uid !== ctx.myUid) {
    const tools = el('div', { class: 'row', style: 'gap:4px' }, [
      (() => {
        const b = el('button', { title: 'Reassign as host', text: '👑', style: 'padding:2px 6px' });
        b.addEventListener('click', () => ctx.onReassign(uid));
        return b;
      })(),
      (() => {
        const b = el('button', { class: 'danger', title: 'Remove from room', text: '✕', style: 'padding:2px 6px' });
        b.addEventListener('click', () => ctx.onKick(uid));
        return b;
      })(),
    ]);
    children.push(tools);
  }

  return el('div', { class: classes.join(' ') }, children);
}

export function renderBoard(
  container: HTMLElement,
  participants: Record<string, Participant>,
  ctx: BoardCtx,
  centerContent: HTMLElement | null
): { resultsPlacedInCenter: boolean } {
  const entries: Entry[] = Object.entries(participants).sort(
    ([, a], [, b]) => a.joinedAt - b.joinedAt
  );
  const sizes = sizeClasses(ctx.round, ctx.model);
  const count = entries.length;

  // Mobile: one row each.
  if (isMobile()) {
    const board = el('div', { class: 'board mobile' });
    for (const [uid, p] of entries) board.append(playerEl(uid, p, ctx, sizes));
    mount(container, board);
    return { resultsPlacedInCenter: false };
  }

  // 26+ : icon-less name/score list.
  if (count > 25) {
    const rows = entries.map(([uid, p]) => {
      const v = ctx.revealed ? ctx.round.votes?.[uid] ?? '' : ctx.round.voted?.[uid] ? '✓' : '';
      return el('tr', {}, [
        el('td', { text: truncateName(p.name) + (p.isObserver ? ' 👁' : '') }),
        el('td', { text: v }),
      ]);
    });
    mount(
      container,
      el('table', { class: 'namelist' }, [
        el('thead', {}, [el('tr', {}, [el('th', { text: 'Participant' }), el('th', { text: 'Vote' })])]),
        el('tbody', {}, rows),
      ])
    );
    return { resultsPlacedInCenter: false };
  }

  // 1–9 : circular poker table (results in the center).
  if (count <= 9) {
    const table = el('div', { class: 'poker-table' });
    entries.forEach(([uid, p], i) => {
      const angle = (-90 + (i * 360) / Math.max(count, 1)) * (Math.PI / 180);
      const node = playerEl(uid, p, ctx, sizes);
      node.style.left = `${50 + 40 * Math.cos(angle)}%`;
      node.style.top = `${50 + 40 * Math.sin(angle)}%`;
      table.append(node);
    });
    if (centerContent) table.append(el('div', { class: 'center' }, [centerContent]));
    mount(container, table);
    return { resultsPlacedInCenter: !!centerContent };
  }

  // 10–25 : grid (4×4 up to 16, else 5×5).
  const grid = el('div', { class: count <= 16 ? 'grid-4' : 'grid-5' });
  for (const [uid, p] of entries) grid.append(playerEl(uid, p, ctx, sizes));
  mount(container, grid);
  return { resultsPlacedInCenter: false };
}
