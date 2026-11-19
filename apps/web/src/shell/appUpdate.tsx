import { useEffect, useState, useSyncExternalStore } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { Icon } from './icons.js';
import { APP_DATE, APP_VERSION } from '../settings/version.js';

/** The plugin's registration, as a parameter so that a test can give its own. */
export type Register = typeof registerSW;

let waiting = false;
/** The number of the version waiting, read from version.json beside the published app; null until known. */
let nextVersion: string | null = null;
let update: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const isWaiting = () => waiting;
const getNextVersion = () => nextVersion;
const notify = () => listeners.forEach(l => l());

/** Reads the published version.json (fresh, not from a cache); null when it cannot be read. */
export async function fetchPublishedVersion(): Promise<string | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
    if (!res.ok) return null;
    const { version } = await res.json() as { version?: unknown };
    return typeof version === 'string' ? version : null;
  } catch {
    return null;
  }
}

/**
 * Registers the service worker and listens for a new version (user's choice, 2026-11-17). It looks again each time the
 * app comes back to the foreground, so an app left open for days learns of one too. Before, the new version was taken
 * in the background and shown only one or two reloads later, without a word.
 */
export function startAppUpdates(register: Register = registerSW, published: () => Promise<string | null> = fetchPublishedVersion): void {
  waiting = false;
  nextVersion = null;
  update = register({
    immediate: true,
    onNeedRefresh() {
      waiting = true;
      notify();
      void published().then(v => { nextVersion = v; notify(); });
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void registration.update(); });
    },
  });
}

/**
 * «C'è una versione nuova · 0.16.0 → 0.17.0 · Aggiorna»: a tap loads it, when the person chooses, so nothing half written is
 * lost. The two numbers (user's choice, 2026-11-19) say what is open and what comes; the new one only once it is read.
 */
export function UpdateBand() {
  const on = useSyncExternalStore(subscribe, isWaiting);
  const next = useSyncExternalStore(subscribe, getNextVersion);
  if (!on) return null;
  return (
    <section className="update-band" role="status" aria-label="Versione nuova">
      <span>C'è una versione nuova di memo-land <span className="versions">{APP_VERSION}{next && next !== APP_VERSION && <> → <b>{next}</b></>}</span></span>
      <button type="button" className="link" onClick={() => void update?.(true)}>Aggiorna</button>
    </section>
  );
}

const SEEN_KEY = 'attivita:seen-build';

/** How long the green band stays (user's choice, 2026-11-17); the line at its bottom runs down in the same time. */
const SHOWN_MS = 6000;

/**
 * The version to announce once a new build is open: the first opening of each build after another one, null otherwise
 * (and at the very first opening). The build is the version and its commit's date, so a build that kept the version
 * number counts too.
 */
export function newVersion(version = APP_VERSION, date = APP_DATE): string | null {
  const build = `${version}|${date}`;
  let seen: string | null = null;
  try { seen = localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, build); } catch { return null; }
  return seen !== null && seen !== build ? version : null;
}

/**
 * «Aggiornata alla 0.6.0», once, after a new version is loaded (user's choice, 2026-11-17): a green band where the band of
 * Aggiorna was, gone after six seconds, with a line running down and a × to close it at once. First it was the toast
 * at the bottom, «molto brutto».
 */
export function UpdatedBand() {
  const [version, setVersion] = useState<string | null>(() => newVersion());
  useEffect(() => {
    if (!version) return;
    const t = setTimeout(() => setVersion(null), SHOWN_MS);
    return () => clearTimeout(t);
  }, [version]);
  if (!version) return null;
  return (
    <section className="updated-band" role="status" aria-label="Versione aggiornata">
      <span className="ok-icon"><Icon name="check" size={14} /></span>
      <span>Aggiornata alla <b>{version}</b></span>
      <button type="button" className="link close" aria-label="Chiudi" onClick={() => setVersion(null)}><Icon name="close" size={16} /></button>
      <span className="run" style={{ animationDuration: `${SHOWN_MS}ms` }} />
    </section>
  );
}
