import { createClient, isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CentralEngine } from '@attivita/engine-central';
import { appHome } from '../appHome.js';
import { idbOutboxStore } from '../offline/idb-store.js';
import { forgetGoogleProjects } from './google-config.js';
import { TIMED_OUT, chooseStartup, offlineIdentity, resolveOnboarding, withinStartupWait } from './onboarding.js';
import type { OpenedSession } from './session.js';

/** The only module that knows the app runs on Supabase. */
let client: SupabaseClient | null = null;
const LAST_ACCOUNT = 'attivita:last-account';

export function supabase(): SupabaseClient {
  client ??= createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  return client;
}

function cachedEmail(): string | null {
  try { return localStorage.getItem(LAST_ACCOUNT); } catch { return null; }
}

function rememberEmail(email: string | null): void {
  try { if (email) localStorage.setItem(LAST_ACCOUNT, email); else localStorage.removeItem(LAST_ACCOUNT); } catch { /* storage unavailable */ }
}

/** How long opening the app waits for the server before it opens offline. */
const STARTUP_WAIT_MS = 5_000;

/** Offline, the app reopens online when the device gets its network back or the auth client renews the session. */
function reloadWhenBack(db: SupabaseClient): void {
  window.addEventListener('online', () => window.location.reload(), { once: true });
  db.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN')) window.location.reload();
  });
}

export async function openCentralSession(): Promise<OpenedSession | null> {
  const db = supabase();
  const loaded = await withinStartupWait(db.auth.getSession(), STARTUP_WAIT_MS);
  const timedOut = loaded === TIMED_OUT;
  const start = chooseStartup({
    sessionEmail: timedOut ? null : loaded.data.session?.user.email ?? null, cachedEmail: cachedEmail(), online: navigator.onLine,
    serverUnreachable: timedOut || isAuthRetryableFetchError(loaded.error),
  });
  if (start.kind === 'login') return null;
  const engine = new CentralEngine(db, start.email.toLowerCase());
  const identity = start.kind === 'offline' ? offlineIdentity(start.email) : await resolveOnboarding(start.email, () => engine.onboard());
  rememberEmail(start.email);
  if (identity.offline) reloadWhenBack(db);
  const signOut = async () => { rememberEmail(null); await forgetGoogleProjects(); await db.auth.signOut(); };
  return { account: identity.account, primary: engine, engines: [engine], personalGroupId: identity.personalGroupId, outbox: idbOutboxStore(), signOut };
}

export async function sendMagicLink(email: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: appHome() } });
  return error ? error.message : null;
}

export type OAuthProvider = 'google' | 'azure';

export async function signInWith(provider: OAuthProvider): Promise<void> {
  await supabase().auth.signInWithOAuth({ provider, options: { redirectTo: appHome() } });
}

export function configuredProviders(): OAuthProvider[] {
  return (import.meta.env.VITE_AUTH_PROVIDERS ?? '').split(',').map((p: string) => p.trim()).filter((p: string): p is OAuthProvider => p === 'google' || p === 'azure');
}
