import { getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider, connectAuthEmulator, getAuth, signInWithCredential, signInWithPopup, signOut,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import {
  connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { GoogleEngine } from '@attivita/engine-google';
import { fail } from '@attivita/core';
import type { FirebaseWebConfig } from './google-config.js';
import { emulatorHosts, onForgetGoogleProjects, registerGoogleEngine, rememberedProjects } from './google-config.js';

/** The only module that knows the app runs on Firebase. It is loaded on demand, never in the first bundle. */
interface Opened { auth: Auth; db: Firestore; engine?: GoogleEngine }
const opened = new Map<string, Opened>();

// Firestore cannot be initialized twice on one app: keep the instances, drop the logins and engines.
onForgetGoogleProjects(async () => {
  await Promise.all([...opened.values()].map(o => { o.engine = undefined; return signOut(o.auth); }));
});

function open(config: FirebaseWebConfig, emulator: { auth: string; firestore: string } | undefined): Opened {
  const known = opened.get(config.projectId);
  if (known) return known;
  const app = getApps().find(a => a.name === config.projectId) ?? initializeApp(config, config.projectId);
  const auth = getAuth(app);
  // Offline reads and writes queue in IndexedDB, shared by the open tabs.
  const db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator.auth}`, { disableWarnings: true });
    const [host, port] = emulator.firestore.split(':');
    connectFirestoreEmulator(db, host!, Number(port));
  }
  const o = { auth, db };
  opened.set(config.projectId, o);
  return o;
}

/** One engine per project and Google account, however many times the project is connected. */
function engineFor(config: FirebaseWebConfig, o: Opened, user: User): GoogleEngine {
  if (!user.emailVerified || !user.email) fail('FORBIDDEN', 'the Google account has no verified email');
  const email = user.email.toLowerCase();
  if (o.engine?.account !== email) {
    o.engine = new GoogleEngine(o.db, email);
    registerGoogleEngine(o.engine, config);
  }
  return o.engine;
}

/**
 * Connects to the group owner's Firebase project with a Google login. On the emulators the login is a fake
 * Google token for `email`, the account the person uses in the app.
 */
export async function connectGoogleProject(config: FirebaseWebConfig, opts: { email?: string; emulator?: { auth: string; firestore: string } } = {}): Promise<GoogleEngine> {
  const o = open(config, opts.emulator);
  const { auth } = o;
  if (opts.emulator) {
    const email = opts.email ?? fail('INVALID_INPUT', 'an email is needed on the emulators');
    const token = JSON.stringify({ sub: email, email, email_verified: true });
    await signInWithCredential(auth, GoogleAuthProvider.credential(token));
  } else {
    const provider = new GoogleAuthProvider();
    if (opts.email) provider.setCustomParameters({ login_hint: opts.email });
    await signInWithPopup(auth, provider);
  }
  try {
    return engineFor(config, o, auth.currentUser!);
  } catch (e) {
    await signOut(auth);
    throw e;
  }
}

/** Projects connected before, whose Google login is still valid in this browser; the others are skipped. */
export async function reopenGoogleProjects(): Promise<GoogleEngine[]> {
  const engines: GoogleEngine[] = [];
  for (const config of rememberedProjects()) {
    const o = open(config, emulatorHosts());
    await o.auth.authStateReady();
    if (o.auth.currentUser?.emailVerified) engines.push(engineFor(config, o, o.auth.currentUser));
  }
  return engines;
}
