import type { Engine } from '@attivita/core';

/** The public web configuration of a Firebase project, as the Firebase console shows it. Not a secret. */
export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

const REQUIRED = ['apiKey', 'authDomain', 'projectId', 'appId'] as const;
const KNOWN = [...REQUIRED, 'storageBucket', 'messagingSenderId', 'measurementId'] as const;
const PROJECTS_KEY = 'attivita:google-projects';
const INVITE_PARAM = 'firebase';

/**
 * Accepts the JSON or the `const firebaseConfig = { … }` snippet copied from the Firebase console.
 * Reads only the known keys, so whatever else is pasted (imports, comments) is ignored.
 */
export function parseFirebaseConfig(text: string): FirebaseWebConfig | null {
  const found: Record<string, string> = {};
  for (const m of text.matchAll(/["']?(\w+)["']?\s*:\s*["']([^"']*)["']/g)) {
    if ((KNOWN as readonly string[]).includes(m[1]!)) found[m[1]!] = m[2]!;
  }
  return REQUIRED.every(k => found[k]) ? found as unknown as FirebaseWebConfig : null;
}

function publicPart(c: FirebaseWebConfig): Pick<FirebaseWebConfig, typeof REQUIRED[number]> {
  return { apiKey: c.apiKey, authDomain: c.authDomain, projectId: c.projectId, appId: c.appId };
}

/** The app link that lets an invited person reach the group's project: no central registry needed. */
export function inviteLink(config: FirebaseWebConfig, base: string): string {
  const url = new URL(base);
  url.searchParams.set(INVITE_PARAM, btoa(JSON.stringify(publicPart(config))));
  return url.toString();
}

export function configFromInvite(search: string): FirebaseWebConfig | null {
  const raw = new URLSearchParams(search).get(INVITE_PARAM);
  if (!raw) return null;
  try { return parseFirebaseConfig(atob(raw)); } catch { return null; }
}

/** Projects this browser connected to, reopened at startup (public configuration only). */
export function rememberedProjects(): FirebaseWebConfig[] {
  try {
    const list = JSON.parse(localStorage.getItem(PROJECTS_KEY) ?? '[]') as unknown[];
    return list.map(x => parseFirebaseConfig(JSON.stringify(x))).filter((c): c is FirebaseWebConfig => c !== null);
  } catch {
    return [];
  }
}

export function rememberProject(config: FirebaseWebConfig): void {
  const others = rememberedProjects().filter(c => c.projectId !== config.projectId);
  try { localStorage.setItem(PROJECTS_KEY, JSON.stringify([...others, publicPart(config)])); } catch { /* storage unavailable */ }
}

const configs = new WeakMap<Engine, FirebaseWebConfig>();

/** Which project an engine talks to, for the invite link of its groups. */
export function registerGoogleEngine(engine: Engine, config: FirebaseWebConfig): void {
  configs.set(engine, config);
}

export function googleConfigOf(engine: Engine | undefined): FirebaseWebConfig | undefined {
  return engine ? configs.get(engine) : undefined;
}

/** The engine already connected to a project: one project, one engine, or router and holder disagree. */
export function engineForProject(engines: Engine[], projectId: string): Engine | undefined {
  return engines.find(e => configs.get(e)?.projectId === projectId);
}

let signOutOpened: (() => Promise<void>) | null = null;

/** google.ts registers how to leave the projects it opened, so this module stays free of Firebase. */
export function onForgetGoogleProjects(fn: () => Promise<void>): void {
  signOutOpened = fn;
}

/** On leaving the account: sign out of every project opened here and forget them in this browser. */
export async function forgetGoogleProjects(): Promise<void> {
  await signOutOpened?.().catch(() => undefined);
  try { localStorage.removeItem(PROJECTS_KEY); } catch { /* storage unavailable */ }
}

/** Emulator addresses when the app runs against the local Firebase emulators (VITE_FIREBASE_EMULATOR=1). */
export function emulatorHosts(): { auth: string; firestore: string } | undefined {
  return import.meta.env.VITE_FIREBASE_EMULATOR === '1' ? { auth: '127.0.0.1:9099', firestore: '127.0.0.1:8080' } : undefined;
}

/** Adds the Google projects connected before to a session; Firebase is loaded only when there are some. */
export async function withGoogleProjects<S extends { primary: Engine; engines: Engine[] }>(session: S | null): Promise<S | null> {
  if (!session || rememberedProjects().length === 0) return session;
  const extra = await import('./google.js').then(m => m.reopenGoogleProjects()).catch(() => []);
  return { ...session, engines: [session.primary, ...extra] };
}
