// Join screen: pick a display name + avatar icon (taken icons disabled), optional spectator.
import { el, mount } from '../util/dom';
import { header } from './header';
import { loadIconList, iconUrl } from '../util/icons';
import { recallIdentity, rememberIdentity } from '../util/cookies';
import { joinRoom } from '../db/rooms';
import { currentUid } from '../auth';

export async function renderJoin(
  root: HTMLElement,
  roomId: string,
  takenIcons: Set<string>,
  onJoined: () => void
): Promise<void> {
  const icons = await loadIconList();
  const recalled = recallIdentity();

  const nameInput = el('input', {
    placeholder: 'Your name',
    maxlength: 40,
    value: recalled?.name ?? '',
  }) as HTMLInputElement;

  // Default selection: remembered icon if still free, else first free icon.
  let selected: string | null =
    recalled && !takenIcons.has(recalled.icon) ? recalled.icon : null;

  const spectatorCb = el('input', { type: 'checkbox' }) as HTMLInputElement;
  const grid = el('div', { class: 'row' });

  function renderGrid(): void {
    mount(grid);
    for (const icon of icons) {
      const taken = takenIcons.has(icon) && icon !== selected;
      const btn = el('button', {
        class: 'egg-card' + (icon === selected ? ' selected' : ''),
        title: taken ? 'Taken' : icon,
        disabled: taken,
        style: 'width:64px;height:64px',
      }, [el('img', { src: iconUrl(icon), alt: icon })]);
      if (taken) btn.style.opacity = '0.3';
      btn.addEventListener('click', () => {
        selected = icon;
        renderGrid();
      });
      grid.append(btn);
    }
  }
  renderGrid();

  const joinBtn = el('button', { class: 'primary', text: 'Join room' });
  joinBtn.addEventListener('click', async () => {
    const name = nameInput.value.trim();
    if (!name) return alert('Please enter a name.');
    if (!selected) return alert('Please pick an icon.');
    rememberIdentity({ name, icon: selected });
    await joinRoom(roomId, currentUid(), {
      name,
      icon: selected,
      isObserver: spectatorCb.checked,
    });
    onJoined();
  });

  mount(
    root,
    el('div', { class: 'wrap stack' }, [
      header(),
      el('div', { class: 'card stack' }, [
        el('h2', { text: 'Join the room' }),
        el('label', { class: 'stack' }, [el('span', { text: 'Display name' }), nameInput]),
        el('div', { class: 'stack' }, [el('span', { text: 'Pick your icon' }), grid]),
        el('label', { class: 'toggle' }, [spectatorCb, el('span', { text: 'Join as spectator (no voting)' })]),
        joinBtn,
      ]),
    ])
  );
}
