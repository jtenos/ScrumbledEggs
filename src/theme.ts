// Light/dark theme: per-user, client-side, persisted; defaults to OS preference.
import { getCookie, setCookie } from './util/cookies';

export type Theme = 'light' | 'dark';

export function initialTheme(): Theme {
  const saved = getCookie('theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme: Theme): void {
  setCookie('theme', theme);
  applyTheme(theme);
}

export function toggleTheme(): Theme {
  const next: Theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme(next);
  return next;
}

/** Random app logo (1–6) chosen per page load. */
export function randomLogoUrl(): string {
  const n = Math.floor(Math.random() * 6) + 1;
  return `/img/logo/logo-${n}.webp`;
}
