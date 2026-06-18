// Shared top bar: random logo + app title + light/dark toggle.
import { el } from '../util/dom';
import { randomLogoUrl, toggleTheme } from '../theme';

export function header(): HTMLElement {
  const logo = el('img', { class: 'logo', src: randomLogoUrl(), alt: 'Scrumbled Eggs logo' });
  const themeBtn = el('button', {
    class: 'theme-toggle',
    title: 'Toggle light/dark',
    'aria-label': 'Toggle light/dark theme',
  });
  const setIcon = () =>
    (themeBtn.textContent = document.documentElement.dataset.theme === 'dark' ? '☀️' : '🌙');
  setIcon();
  themeBtn.addEventListener('click', () => {
    toggleTheme();
    setIcon();
  });

  return el('div', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [logo, el('h1', { text: 'Scrumbled Eggs' })]),
    themeBtn,
  ]);
}
