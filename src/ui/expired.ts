// Expired-room tombstone page and the generic not-found / removed states.
import { el, mount } from '../util/dom';
import { header } from './header';
import { goHome } from '../router';

function page(root: HTMLElement, image: string | null, title: string, message: string): void {
  const homeBtn = el('button', { class: 'primary', text: 'Back to home' });
  homeBtn.addEventListener('click', () => goHome());
  mount(
    root,
    el('div', { class: 'wrap stack' }, [
      header(),
      el('div', { class: 'card expired stack' }, [
        image ? el('img', { src: image, alt: '' }) : false,
        el('h2', { text: title }),
        el('p', { class: 'muted', text: message }),
        homeBtn,
      ])
    ])
  );
}

export function renderExpired(root: HTMLElement): void {
  page(root, '/img/eggspired.webp', 'This room has expired', 'Old rooms are cleaned up automatically. Start a fresh one from the home page.');
}

export function renderNotFound(root: HTMLElement): void {
  page(root, '/img/eggspired.webp', 'Room not found', "We couldn't find that room. It may have expired or the link is incorrect.");
}

export function renderRemoved(root: HTMLElement): void {
  page(root, null, 'You were removed', 'The host removed you from this room.');
}
