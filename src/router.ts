// Minimal hash router. Room URLs look like  <origin>/#/room/<roomId>
// The bookmarkable preset link uses a query string on the home URL: <origin>/?scale=...

export type Route = { name: 'home' } | { name: 'room'; roomId: string };

export function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '');
  const m = hash.match(/^\/room\/([^/]+)$/);
  if (m) return { name: 'room', roomId: decodeURIComponent(m[1]) };
  return { name: 'home' };
}

export function roomUrl(roomId: string): string {
  return `${window.location.origin}${window.location.pathname}#/room/${encodeURIComponent(roomId)}`;
}

export function goToRoom(roomId: string): void {
  window.location.hash = `#/room/${encodeURIComponent(roomId)}`;
}

export function homeUrl(): string {
  // Bare origin+path: no hash, no preset query — resolves to the home route.
  return `${window.location.origin}${window.location.pathname}`;
}

export function goHome(): void {
  // Drop any preset query string too, so we don't re-trigger auto-create.
  window.location.href = homeUrl();
}

export function onRouteChange(cb: () => void): void {
  window.addEventListener('hashchange', cb);
}
