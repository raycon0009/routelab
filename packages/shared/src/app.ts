import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth, signInAnonymously, type Auth, type User } from 'firebase/auth';
import { firebaseConfig } from './firebaseConfig';

export interface FirebaseBundle {
  app: FirebaseApp;
  auth: Auth;
  appCheck: AppCheck | null;
  /** 'recaptcha' when a site key is configured, 'debug' when running with a debug token, 'none' otherwise. */
  appCheckMode: 'recaptcha' | 'debug' | 'none';
}

/**
 * Initialises Firebase. App Check must be initialised BEFORE getAI is used.
 * Without a reCAPTCHA v3 site key, dev builds enable the debug token and the UI should show a warning.
 */
export function initFirebase(opts: { recaptchaSiteKey?: string; dev: boolean }): FirebaseBundle {
  const existing = getApps()[0];
  const app = existing ?? initializeApp(firebaseConfig);
  let appCheck: AppCheck | null = null;
  let appCheckMode: FirebaseBundle['appCheckMode'] = 'none';
  if (!existing) {
    if (opts.recaptchaSiteKey) {
      appCheck = initializeAppCheck(app, {
        provider: new ReCaptchaV3Provider(opts.recaptchaSiteKey),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckMode = 'recaptcha';
    } else if (opts.dev) {
      (
        self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN: boolean }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      appCheck = initializeAppCheck(app, {
        // A placeholder key: in debug mode the provider is not contacted for a real challenge.
        provider: new ReCaptchaV3Provider('debug-placeholder-key'),
        isTokenAutoRefreshEnabled: true,
      });
      appCheckMode = 'debug';
    }
  }
  return { app, auth: getAuth(app), appCheck, appCheckMode };
}

export async function ensureSignedIn(auth: Auth): Promise<User> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}
