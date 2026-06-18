// Firebase bootstrap: app + anonymous auth + Realtime Database.
// The app is fully client-side; integrity is enforced by RTDB Security Rules,
// so these public config values are safe to ship in the bundle.
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator } from 'firebase/database';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!config.databaseURL) {
  console.warn(
    'Firebase is not configured. Copy .env.example to .env and fill in your Firebase web config.'
  );
}

export const app = initializeApp(config);
export const auth = getAuth(app);
export const db = getDatabase(app);

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
}
