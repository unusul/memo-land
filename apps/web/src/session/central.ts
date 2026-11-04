import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { CentralEngine } from '@attivita/engine-central';
import { idbOutboxStore } from '../offline/idb-store.js';
import { forgetGoogleProjects } from './google-config.js';
import { chooseStartup, offlineIdentity, resolveOnboarding } from './onboarding.js';
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

export async function openCentralSession(): Promise<OpenedSession | null> {
  const db = supabase();
  const { data } = await db.auth.getSession();
  const start = chooseStartup({ sessionEmail: data.session?.user.email ?? null, cachedEmail: cachedEmail(), online: navigator.onLine });
  if (start.kind === 'login') return null;
  const engine = new CentralEngine(db, start.email.toLowerCase());
  const identity = start.kind === 'offline' ? offlineIdentity(start.email) : await resolveOnboarding(start.email, () => engine.onboard());
  rememberEmail(start.email);
  if (identity.offline) window.addEventListener('online', () => window.location.reload(), { once: true });
  const signOut = async () => { rememberEmail(null); await forgetGoogleProjects(); await db.auth.signOut(); };
  return { account: identity.account, primary: engine, engines: [engine], personalGroupId: identity.personalGroupId, outbox: idbOutboxStore(), signOut };
}

export async function sendMagicLink(email: string): Promise<string | null> {
  const { error } = await supabase().auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
  return error ? error.message : null;
}

export type OAuthProvider = 'google' | 'azure';

export async function signInWith(provider: OAuthProvider): Promise<void> {
  await supabase().auth.signInWithOAuth({ provider, options: { redirectTo: window.location.origin } });
}

export function configuredProviders(): OAuthProvider[] {
  return (import.meta.env.VITE_AUTH_PROVIDERS ?? '').split(',').map((p: string) => p.trim()).filter((p: string): p is OAuthProvider => p === 'google' || p === 'azure');
}
