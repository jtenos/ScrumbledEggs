// Anonymous authentication. The resulting uid IS the participant identity and is
// persisted by Firebase across reloads, so a refresh/reconnect rejoins as the same user.
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';

let cachedUid: string | null = null;
let authPromise: Promise<string> | null = null;

/**
 * Resolve the stable anonymous uid. Safe to call concurrently — all callers share one
 * promise, so we never kick off a second sign-in. Reuses any persisted session (only
 * signs in anonymously when there is genuinely no user yet).
 */
export function ensureAuth(): Promise<string> {
  if (cachedUid) return Promise.resolve(cachedUid);
  if (authPromise) return authPromise;

  authPromise = new Promise((resolve, reject) => {
    const unsub = onAuthStateChanged(
      auth,
      (user) => {
        if (user) {
          cachedUid = user.uid;
          unsub();
          resolve(user.uid);
        } else {
          // No persisted/active session → create one. The resulting state change
          // re-enters this same listener with the new user.
          signInAnonymously(auth).catch((err) => {
            unsub();
            reject(err);
          });
        }
      },
      (err) => {
        unsub();
        reject(err);
      }
    );
  });
  return authPromise;
}

export function currentUid(): string {
  if (!cachedUid) throw new Error('Auth not ready — call ensureAuth() first');
  return cachedUid;
}
