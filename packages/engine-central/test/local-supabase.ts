import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountId } from '@attivita/core';
import type { SessionFactory } from '@attivita/core/test/engine-contract';
import { CentralEngine } from '../src/index.js';

/** vitest.config loads .env.local into the process environment. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const URL = env['VITE_SUPABASE_URL'] ?? '';
const ANON = env['VITE_SUPABASE_ANON_KEY'] ?? '';
const SERVICE = env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function admin(): SupabaseClient {
  if (!URL || !SERVICE) throw new Error('Run scripts/db-env.sh first: local Supabase URL/keys missing');
  return createClient(URL, SERVICE, noSession);
}

/** Wipes app tables and test users so every backend starts empty. */
export async function resetDatabase(): Promise<void> {
  const db = admin();
  for (const [table, col] of [['activities', 'id'], ['group_members', 'group_id'], ['groups', 'id'], ['changes', 'id'], ['accounts', 'account_id']] as const) {
    const { error } = await db.from(table).delete().neq(col, '');
    if (error) throw new Error(`reset ${table}: ${error.message}`);
  }
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(`list users: ${error.message}`);
  await Promise.all(data.users.map(u => db.auth.admin.deleteUser(u.id)));
}

async function signUp(email: string): Promise<{ client: SupabaseClient; userId: string }> {
  const client = createClient(URL, ANON, noSession);
  const { data, error } = await client.auth.signUp({ email, password: crypto.randomUUID() });
  if (error || !data.user || !data.session) throw new Error(`sign up ${email}: ${error?.message ?? 'no session'}`);
  return { client, userId: data.user.id };
}

/** Contract backend: short account names mapped to "<name>@altereos.com" users with that account id. */
export async function openLocalBackend(): Promise<SessionFactory> {
  await resetDatabase();
  const sessions = new Map<AccountId, CentralEngine>();
  const pending = new Map<AccountId, Promise<CentralEngine>>();
  const open = async (account: AccountId): Promise<CentralEngine> => {
    const { client, userId } = await signUp(`${account}@altereos.com`);
    const { error } = await admin().from('accounts').insert({ user_id: userId, account_id: account, email: `${account}@altereos.com` });
    if (error) throw new Error(`account ${account}: ${error.message}`);
    const engine = new CentralEngine(client, account);
    sessions.set(account, engine);
    return engine;
  };
  const factory = (account: AccountId) => {
    const ready = sessions.get(account);
    if (ready) return ready;
    if (!pending.has(account)) pending.set(account, open(account));
    return lazyEngine(account, pending.get(account)!);
  };
  return factory;
}

/** An Engine whose calls wait for the sign-up of its account; keeps the contract's synchronous factory. */
function lazyEngine(account: AccountId, ready: Promise<CentralEngine>): CentralEngine {
  return new Proxy({ account } as CentralEngine, {
    get(target, prop) {
      if (prop === 'account') return account;
      if (prop === 'then') return undefined;
      if (prop === 'kind') return 'central';
      if (prop === 'limits') return new CentralEngine(createClient(URL, ANON, noSession), account).limits;
      return (...args: unknown[]) => ready.then(e => (e as unknown as Record<string | symbol, (...a: unknown[]) => unknown>)[prop]!.apply(e, args));
    },
  });
}

/** Onboarding tests: a real user with that email and no pre-made account row. */
export async function openLocalUser(email: string): Promise<CentralEngine> {
  const { client } = await signUp(email);
  return new CentralEngine(client, email.toLowerCase());
}
