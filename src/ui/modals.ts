// Full-screen GIF overlays with a growing pun caption: consensus, spread, waiting.
// GIFs are preloaded hidden at page load so first display hits the browser cache.
import { el } from '../util/dom';

const GIFS = ['/img/celebrate.gif', '/img/spread.gif', '/img/waiting.gif'];

export function preloadGifs(): void {
  for (const src of GIFS) {
    const img = el('img', { src, class: 'preload', alt: '' });
    document.body.append(img);
  }
}

const CELEBRATE_PUNS = ['Egg-cellent!', 'Shell Yeah!', 'Yolk Yeah!', 'Shell-ebrate!', 'Egg-citing!'];
const SPREAD_PUNS = ['Eggsasperating…', 'Oh shell no…', 'Oh yolk!', 'Eggads!'];
const WAITING_PUNS = ['Get cracking.', 'Egg-specting you...', "Let's scramble"];

let activeOverlay: HTMLElement | null = null;

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

function showOverlay(gif: string, puns: string[], durationMs: number): void {
  activeOverlay?.remove();
  const overlay = el('div', { class: 'overlay' }, [
    el('div', { class: 'gifwrap' }, [
      el('img', { src: gif, alt: '' }),
      el('div', { class: 'pun', text: pick(puns), style: `--grow-dur:${durationMs}ms` }),
    ]),
  ]);
  document.body.append(overlay);
  activeOverlay = overlay;
  setTimeout(() => {
    overlay.remove();
    if (activeOverlay === overlay) activeOverlay = null;
  }, durationMs);
}

export const showCelebrate = () => showOverlay('/img/celebrate.gif', CELEBRATE_PUNS, 3000);
export const showSpread = () => showOverlay('/img/spread.gif', SPREAD_PUNS, 1000);
export const showWaiting = () => showOverlay('/img/waiting.gif', WAITING_PUNS, 2000);
