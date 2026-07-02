import {
  initializeApp,
  cert,
  applicationDefault,
  getApps,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Firebase Admin SDK initialization.
 *
 * Credentials are resolved in this order:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON  — the full service-account JSON as a single
 *      env var (handy on Cloud Run / CI). Can be raw JSON or base64-encoded.
 *   2. GOOGLE_APPLICATION_CREDENTIALS  — path to a service-account .json file
 *      (picked up automatically via applicationDefault()).
 *   3. applicationDefault()            — the runtime's default service account
 *      (this is what Cloud Run / GCP provide out of the box).
 *
 * If none of these work the app still boots — Firebase auth simply stays
 * disabled and the legacy JWT path keeps working (see middleware/auth.ts).
 */

let app: App | null = null;
let initError: string | null = null;

function loadServiceAccount(): ServiceAccount | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    // Support both raw JSON and base64-encoded JSON.
    const text = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf-8');
    const parsed = JSON.parse(text);
    // The JSON `private_key` often arrives with escaped newlines from env files.
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    return parsed as ServiceAccount;
  } catch (err: any) {
    initError = `FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON: ${err.message}`;
    return null;
  }
}

function init() {
  if (app || getApps().length > 0) {
    app = app || getApps()[0];
    return;
  }
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const serviceAccount = loadServiceAccount();

    if (serviceAccount) {
      app = initializeApp({ credential: cert(serviceAccount), projectId });
    } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      app = initializeApp({ credential: applicationDefault(), projectId });
    } else if (projectId) {
      // On Cloud Run / GCP this uses the attached default service account.
      app = initializeApp({ credential: applicationDefault(), projectId });
    } else {
      initError = 'No Firebase credentials found (set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID).';
      return;
    }
    console.log('🔥 Firebase Admin initialized' + (projectId ? ` (project: ${projectId})` : ''));
  } catch (err: any) {
    initError = err.message;
    console.warn('⚠️  Firebase Admin init failed — running in legacy-auth mode:', err.message);
  }
}

init();

/** True when Firebase Admin is ready to verify ID tokens / manage users. */
export function isFirebaseEnabled(): boolean {
  return app !== null;
}

export function firebaseInitError(): string | null {
  return initError;
}

/** Firebase Auth handle — throws if Firebase is not configured. */
export function adminAuth(): Auth {
  if (!app) {
    throw new Error(initError || 'Firebase Admin is not configured');
  }
  return getAuth(app);
}
