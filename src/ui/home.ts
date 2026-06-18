// Home / create-room page. Also handles the bookmarkable preset link
// (?scale=...&zero=1&unknown=0&infinity=1), which skips the scale picker.
import { el, mount } from '../util/dom';
import { header } from './header';
import { ensureAuth } from '../auth';
import { createRoom } from '../db/rooms';
import { goToRoom } from '../router';
import {
  PRESET_SCALES,
  DEFAULT_OPTIONS,
  buildDeck,
  deckToSet,
  buildPresetQuery,
  parsePresetQuery,
  parseCustomValues,
  type ScaleOptions,
  type ScaleSelection,
} from '../scales';

export async function renderHome(root: HTMLElement): Promise<void> {
  const preset = parsePresetQuery(window.location.search);
  if (preset) {
    renderPresetCreate(root, preset);
  } else {
    renderFullCreate(root);
  }
}

async function create(
  roomName: string,
  storyTitle: string,
  selection: ScaleSelection,
  autoReveal: boolean
): Promise<void> {
  const deck = buildDeck(selection.values, selection.options);
  const uid = await ensureAuth();
  const roomId = await createRoom({
    name: roomName.trim() || 'Scrumbled Eggs',
    deck,
    deckSet: deckToSet(deck),
    autoReveal,
    hostUid: uid,
    firstStoryTitle: storyTitle.trim(),
  });
  goToRoom(roomId);
}

// --- Preset link: scale is locked, only prompt for story (and room) name ---
function renderPresetCreate(root: HTMLElement, preset: ScaleSelection): void {
  const roomInput = el('input', { placeholder: 'Room name', value: 'Scrumbled Eggs' });
  const storyInput = el('input', { placeholder: 'What are we estimating?' });
  const deck = buildDeck(preset.values, preset.options);

  const createBtn = el('button', { class: 'primary', text: 'Create room' });
  createBtn.addEventListener('click', () => {
    void create(roomInput.value, storyInput.value, preset, true);
  });

  mount(
    root,
    el('div', { class: 'wrap stack' }, [
      header(),
      el('div', { class: 'card stack' }, [
        el('h2', { text: 'Start a session' }),
        el('p', { class: 'muted', text: `Scale: ${deck.join(', ')}` }),
        el('label', { class: 'stack' }, [el('span', { text: 'Room name' }), roomInput]),
        el('label', { class: 'stack' }, [el('span', { text: 'First story name' }), storyInput]),
        createBtn,
      ]),
    ])
  );
  storyInput.focus();
}

// --- Full create form with scale picker ---
function renderFullCreate(root: HTMLElement): void {
  let selectedPreset = PRESET_SCALES[0];
  let isCustom = false;
  const options: ScaleOptions = { ...DEFAULT_OPTIONS };
  let autoReveal = true;

  const roomInput = el('input', { placeholder: 'Room name', value: 'Scrumbled Eggs' });
  const storyInput = el('input', { placeholder: 'What are we estimating?' });
  const customInput = el('input', { placeholder: 'e.g. 1, 2, 3, 5, 8', class: 'hidden' });

  const scaleButtons = el('div', { class: 'row' });
  const presetLinkBox = el('div', { class: 'stack' });

  function currentSelection(): ScaleSelection {
    const values = isCustom ? parseCustomValues(customInput.value) : selectedPreset.values;
    return { values, options };
  }

  function refreshPresetLink(): void {
    const sel = currentSelection();
    if (sel.values.length === 0) {
      mount(presetLinkBox, el('p', { class: 'muted', text: 'Add custom values to get a shareable link.' }));
      return;
    }
    const url = `${window.location.origin}${window.location.pathname}?${buildPresetQuery(sel)}`;
    const copyBtn = el('button', { text: 'Copy preset link' });
    copyBtn.addEventListener('click', async () => {
      await navigator.clipboard.writeText(url).catch(() => {});
      copyBtn.textContent = 'Copied!';
      setTimeout(() => (copyBtn.textContent = 'Copy preset link'), 1500);
    });
    mount(
      presetLinkBox,
      el('p', { class: 'muted', text: 'Bookmark this link to skip scale setup next time:' }),
      el('div', { class: 'row' }, [
        el('input', { value: url, readonly: true, style: 'flex:1' }),
        copyBtn,
      ])
    );
  }

  function rebuildScaleButtons(): void {
    mount(scaleButtons);
    for (const p of PRESET_SCALES) {
      const b = el('button', { text: p.label });
      if (!isCustom && p.id === selectedPreset.id) b.classList.add('primary');
      b.addEventListener('click', () => {
        selectedPreset = p;
        isCustom = false;
        customInput.classList.add('hidden');
        rebuildScaleButtons();
        refreshPresetLink();
      });
      scaleButtons.append(b);
    }
    const customBtn = el('button', { text: 'Custom' });
    if (isCustom) customBtn.classList.add('primary');
    customBtn.addEventListener('click', () => {
      isCustom = true;
      customInput.classList.remove('hidden');
      customInput.focus();
      rebuildScaleButtons();
      refreshPresetLink();
    });
    scaleButtons.append(customBtn);
  }

  customInput.addEventListener('input', refreshPresetLink);

  function toggle(label: string, key: keyof ScaleOptions): HTMLElement {
    const cb = el('input', { type: 'checkbox' }) as HTMLInputElement;
    cb.addEventListener('change', () => {
      options[key] = cb.checked;
      refreshPresetLink();
    });
    return el('label', { class: 'toggle' }, [cb, el('span', { text: label })]);
  }

  const autoCb = el('input', { type: 'checkbox' }) as HTMLInputElement;
  autoCb.checked = true;
  autoCb.addEventListener('change', () => (autoReveal = autoCb.checked));

  const createBtn = el('button', { class: 'primary', text: 'Create room' });
  createBtn.addEventListener('click', () => {
    const sel = currentSelection();
    if (sel.values.length === 0) {
      alert('Please choose a scale or enter custom values.');
      return;
    }
    void create(roomInput.value, storyInput.value, sel, autoReveal);
  });

  rebuildScaleButtons();
  refreshPresetLink();

  mount(
    root,
    el('div', { class: 'wrap stack' }, [
      header(),
      el('div', { class: 'card stack' }, [
        el('h2', { text: 'Create a planning poker room' }),
        el('label', { class: 'stack' }, [el('span', { text: 'Room name' }), roomInput]),
        el('label', { class: 'stack' }, [el('span', { text: 'First story name' }), storyInput]),
        el('div', { class: 'stack' }, [el('span', { text: 'Pointing scale' }), scaleButtons, customInput]),
        el('div', { class: 'stack' }, [
          el('span', { text: 'Include special cards' }),
          el('div', { class: 'row' }, [
            toggle('Zero (0)', 'zero'),
            toggle('Unknown (?)', 'unknown'),
            toggle('Infinity (∞)', 'infinity'),
          ]),
        ]),
        el('label', { class: 'toggle' }, [autoCb, el('span', { text: 'Auto-reveal when everyone has voted' })]),
        createBtn,
        el('hr'),
        presetLinkBox,
      ]),
    ])
  );
}
