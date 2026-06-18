// Thin cookie helpers for client-side prefs (name/icon) and the per-room soft ban.

export function setCookie(name: string, value: string, days = 365): void {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

// --- Per-room soft ban (kicked users). Not real security; user can clear it. ---

const banKey = (roomId: string) => `banned_${roomId}`;

export function setBanned(roomId: string): void {
  setCookie(banKey(roomId), '1', 1); // short-lived: ~1 day
}

export function isBanned(roomId: string): boolean {
  return getCookie(banKey(roomId)) === '1';
}

// --- Remembered identity (name + icon) ---

export interface RememberedIdentity {
  name: string;
  icon: string;
}

export function rememberIdentity(id: RememberedIdentity): void {
  setCookie('identity', JSON.stringify(id));
}

export function recallIdentity(): RememberedIdentity | null {
  const raw = getCookie('identity');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.name === 'string' && typeof parsed?.icon === 'string') return parsed;
  } catch {
    /* ignore malformed */
  }
  return null;
}
