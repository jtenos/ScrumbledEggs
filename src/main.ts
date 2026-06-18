import './styles/app.css';
import { applyTheme, initialTheme } from './theme';
import { ensureAuth } from './auth';
import { parseRoute, onRouteChange } from './router';
import { renderHome } from './ui/home';
import { renderRoom } from './ui/room';

const root = document.getElementById('app')!;

applyTheme(initialTheme());

async function route(): Promise<void> {
  const r = parseRoute();
  if (r.name === 'room') {
    await renderRoom(root, r.roomId);
  } else {
    await renderHome(root);
  }
}

// Warm anonymous auth in the background; pages that need it (create/join/room) await it.
ensureAuth().catch((err) => console.error('Auth failed — check .env configuration', err));

onRouteChange(() => void route());
void route();
