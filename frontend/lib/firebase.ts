'use client';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';

// Public client config for the `crmlao` Firebase project.
// These values are NOT secret — Firebase web API keys are safe to ship in the
// browser; access is controlled by Firebase Auth + security rules. Env vars
// override them so you can point at another project without code changes.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBOyxCCDxACJ48TuDQgwNJdu5bCC8GIApU',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'crmlao.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'crmlao',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'crmlao.firebasestorage.app',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '835989522150',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:835989522150:web:9bb06f87db35afc7b95d27',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-XY4EJJS1FC',
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Persist the session across reloads (browser only).
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch(() => {});
  // Analytics is optional and browser-only — never let it break the app.
  import('firebase/analytics')
    .then(({ getAnalytics, isSupported }) => isSupported().then((ok) => { if (ok) getAnalytics(app); }))
    .catch(() => {});
}

// Resolve once Firebase has restored (or confirmed the absence of) a session.
let authReady: Promise<User | null> | null = null;
export function waitForAuth(): Promise<User | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (!authReady) {
    authReady = new Promise((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
    });
  }
  return authReady;
}

/** Get a fresh Firebase ID token (auto-refreshes when near expiry), or null. */
export async function getIdToken(forceRefresh = false): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const user = auth.currentUser || (await waitForAuth());
  if (!user) return null;
  try {
    const t = await user.getIdToken(forceRefresh);
    // Keep the stored copy fresh for code that reads crm_token directly (e.g. the
    // LINE image-proxy <img> URL), since Firebase ID tokens expire after ~1 hour.
    try { localStorage.setItem('crm_token', t); } catch { /* ignore */ }
    return t;
  } catch {
    return null;
  }
}

export default app;
