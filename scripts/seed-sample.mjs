#!/usr/bin/env node
// Puts sample data into the LOCAL Supabase (never a hosted project): the account lulli@lulli.com, signed in as a
// real user would be, with a dozen activities around today (overdue, today, series, a shopping list, ideas).
// The engine-central tests wipe the local database; run this afterwards to get a usable app again.
//
//   npm run seed              adds the sample if the account has no activities yet
//   npm run seed -- --reset   deletes the account's activities first, then adds the sample
//   npm run seed -- --email someone@example.com   another account (default lulli@lulli.com)
//     (an account of a non-public domain joins that domain's group: its domain activities are seen by the others there)
//
// Needs the keys written by scripts/db-env.sh (packages/engine-central/.env.local).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const emailArg = process.argv.indexOf('--email');
const EMAIL = (emailArg > 0 ? process.argv[emailArg + 1] : 'lulli@lulli.com').toLowerCase();
const reset = process.argv.includes('--reset');

const env = Object.fromEntries(readFileSync(new URL('../packages/engine-central/.env.local', import.meta.url), 'utf8')
  .split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
const URL_ = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY, SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error('Local keys missing: run "bash scripts/db-env.sh" first');
if (!/^http:\/\/(192\.168\.|127\.|localhost)/.test(URL_)) throw new Error(`Refusing to seed a non-local Supabase: ${URL_}`);

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, noSession);

async function signIn() {
  const { data: users, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  if (!users.users.some(u => u.email === EMAIL)) {
    const { error: e } = await admin.auth.admin.createUser({ email: EMAIL, email_confirm: true });
    if (e) throw e;
  }
  const { data: link, error: e1 } = await admin.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
  if (e1) throw e1;
  const db = createClient(URL_, ANON, noSession);
  const { error: e2 } = await db.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (e2) throw e2;
  return db;
}

const pad = n => String(n).padStart(2, '0');
/** A local date `offset` days from today, as the app stores it (YYYY-MM-DD). */
function day(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const weekdayOf = offset => WEEKDAY[new Date(`${day(offset)}T12:00`).getDay()];

function sample(account) {
  const now = new Date().toISOString();
  const P = `personal:${account}`, D = `domain:${account.split('@')[1]}`;
  const mk = (title, groupId, props, extra = {}) => ({
    id: crypto.randomUUID(), accountId: account, groupId, title, body: '', attachments: [], props, status: 'open', overrides: {},
    history: [{ at: now, by: account, kind: 'created' }], createdAt: now, updatedAt: now, version: 1, ...extra,
  });
  const shopping = { latte: 4, pane: 5, uova: 2, mele: 3, pomodori: 2, parmigiano: 1, lattuga: 1 };
  return [
    mk("Rinnovare l'assicurazione dell'auto", P, { due: day(-3) }),
    mk('Pagare la bolletta della luce', P, { due: day(0) }),
    mk('Riunione settimanale', D, { schedule: { start: `${day(0)}T10:00`, end: `${day(0)}T11:00` }, repeat: { mode: 'calendar', rrule: `FREQ=WEEKLY;BYDAY=${weekdayOf(0)}` } }),
    mk('Chiamare il dentista', P, { due: day(1) }),
    mk('Palestra', P, { schedule: { start: `${day(1)}T18:30`, end: `${day(1)}T19:30` }, repeat: { mode: 'calendar', rrule: `FREQ=WEEKLY;BYDAY=${weekdayOf(1)}` } }),
    mk('Preparare il report mensile', D, { due: day(2) }),
    mk('Spesa al mercato', P, { schedule: { start: `${day(3)}T09:00` }, repeat: { mode: 'calendar', rrule: `FREQ=WEEKLY;BYDAY=${weekdayOf(3)}` } }, {
      checklist: { items: [{ id: 'i1', text: 'pane', done: false }, { id: 'i2', text: 'mele', done: false }, { id: 'i3', text: 'latte', done: true }], fixed: false, known: shopping, seq: 3 },
    }),
    mk('Cambiare il filtro della cappa', P, { due: day(7), repeat: { mode: 'fromCompletion', every: { unit: 'month', count: 3 } } }),
    mk('Aggiornare il contratto del fornitore', D, { waitingFor: { condition: "firma dell'ufficio legale" } }),
    mk('Idea: corso di fotografia', P, {}),
    mk('Riordinare la cantina', P, {}),
  ];
}

const db = await signIn();
const { data: account, error: e3 } = await db.rpc('ensure_account', {});
if (e3) throw e3;
const { error: e4 } = await db.rpc('join_domain_group', { rejoin: false });
if (e4) throw e4;

const { count, error: e5 } = await admin.from('activities').select('id', { count: 'exact', head: true }).eq('account_id', account);
if (e5) throw e5;
if (count && !reset) {
  console.log(`${account} already has ${count} activities: nothing added (use --reset to replace them).`);
  process.exit(0);
}
if (count) {
  const { error } = await admin.from('activities').delete().eq('account_id', account);
  if (error) throw error;
}
for (const doc of sample(account)) {
  const { error } = await db.rpc('save_activity', { doc, expected: null });
  if (error) throw new Error(`${doc.title}: ${error.message}`);
}
console.log(`${account}: ${sample(account).length} sample activities added${count ? ` (${count} removed first)` : ''}. Sign in with that email in the app.`);
