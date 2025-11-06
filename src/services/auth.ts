import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  setPersistence,
  browserSessionPersistence,
  browserLocalPersistence,
  inMemoryPersistence,
  type User
} from 'firebase/auth'
import { app } from './firebaseConfig'

export const auth = getAuth(app)

// Default to SESSION persistence so closing the browser tab ends the auth session.
// This addresses the "auto-login" experience caused by LOCAL persistence.
setPersistence(auth, browserSessionPersistence).catch(err => {
  // Non-fatal; fallback remains the library default if this fails.
  console.error('[auth] Failed to set session persistence', err)
})

// Optional runtime switcher if you later want to toggle persistence (e.g., a "Remember me" checkbox)
export async function configureAuthPersistence(mode: 'session' | 'local' | 'none') {
  const map = {
    session: browserSessionPersistence,
    local: browserLocalPersistence,
    none: inMemoryPersistence
  } as const
  await setPersistence(auth, map[mode])
}

export function login(email: string, password: string) {
  return signInWithEmailAndPassword(auth, email, password)
}

export function logout() {
  return signOut(auth)
}

export function watchAuth(cb: (u: User | null) => void) {
  return onAuthStateChanged(auth, cb)
}

// Development debug exposure (do not rely on this in prod)
if (import.meta.env.DEV) {
  (window as any).__AUTH = auth;
  (window as any).__printClaims = async (force = false) => {
    const u = auth.currentUser;
    if (!u) { console.log('No user'); return; }
    const res = await u.getIdTokenResult(force);
    console.log(`Claims (force=${force}):`, res.claims);
  };
  console.log('[auth] Debug helpers: __AUTH, __printClaims(force:boolean)');
}

export {}