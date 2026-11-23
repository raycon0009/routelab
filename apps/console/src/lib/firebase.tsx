import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import type { AI } from 'firebase/ai';
import { createAI, ensureSignedIn, initFirebase, type FirebaseBundle } from '@routelab/shared';

interface Ctx {
  bundle: FirebaseBundle;
  ai: AI;
  db: Firestore;
  user: User | null;
  authError: string | null;
}

const FirebaseContext = createContext<Ctx | null>(null);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const core = useMemo(() => {
    const bundle = initFirebase({
      recaptchaSiteKey: import.meta.env.VITE_RECAPTCHA_SITE_KEY || undefined,
      dev: import.meta.env.DEV,
    });
    return { bundle, ai: createAI(bundle.app), db: getFirestore(bundle.app) };
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  useEffect(() => {
    ensureSignedIn(core.bundle.auth).then(setUser, (e: unknown) =>
      setAuthError(e instanceof Error ? e.message : String(e)),
    );
  }, [core]);
  return (
    <FirebaseContext.Provider value={{ ...core, user, authError }}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase(): Ctx {
  const c = useContext(FirebaseContext);
  if (!c) throw new Error('FirebaseProvider missing');
  return c;
}
