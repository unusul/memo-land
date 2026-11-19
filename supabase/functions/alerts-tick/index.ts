// alerts-tick (2026-11-19): the alerts computed on the server, with the app's own code (packages/core, bundled by
// `npm run bundle:core`), so a change made by someone else alerts too, with every app closed. pg_cron calls it every
// minute (migration 0010); each run sends what came due in the last half hour and was not sent yet, on the channels
// the person has on: Telegram (through the database, which keeps the bot's token) and the browser's push.
//
// Secrets of the function: ALERTS_TICK_SECRET (the header pg_cron sends), VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT («mailto:…» or an https address). SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY come with the platform.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { alertKey, dueAlerts } from '../_shared/core.js';

// The core's types, as much of them as this file uses: the bundle is JavaScript, and packages/ is not deployed.
type Activity = Record<string, unknown>;
interface Group {
  id: string; kind: string; name: string; timeZone: string; version: number; members: Record<string, string>;
  type?: 'list'; archived?: boolean; domain?: string; ownerId?: string;
}
interface AlertPerson { account: string; groups: Group[]; activities: Activity[]; alerts: Record<string, unknown>; zone: string }
interface AlertEntry { at: string; text: string; time: string; activityId: string; of: string; before: number; push: { title: string; body: string } }

/** A device that asked for the push: its endpoint and keys, as the browser gave them. */
interface PushRow { account_id: string; endpoint: string; p256dh: string; auth: string }
interface Channels { telegram: Set<string>; push: Map<string, PushRow[]> }

const env = (name: string): string => {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing secret ${name}`);
  return v;
};

Deno.serve(async req => {
  if (req.headers.get('x-alerts-secret') !== env('ALERTS_TICK_SECRET')) return new Response('forbidden', { status: 403 });
  const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  webpush.setVapidDetails(env('VAPID_SUBJECT'), env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const now = new Date();
  const channels = await channelsOf(db);
  const accounts = [...new Set([...channels.telegram, ...channels.push.keys()])];
  let sent = await sendTests(db);
  for (const p of await peopleOf(db, accounts)) {
    for (const e of await notSentYet(db, p.account, dueAlerts(p, now) as AlertEntry[])) sent += await deliver(db, channels, p.account, e);
  }
  await db.from('alerts_sent').delete().lt('sent_at', new Date(now.getTime() - 8 * 86_400_000).toISOString());
  return Response.json({ people: accounts.length, sent });
});

/** Who has a channel on: a Telegram chat with the switch on, or at least one device with the push. */
async function channelsOf(db: Db): Promise<Channels> {
  const [{ data: links, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
    db.from('telegram_links').select('account_id').not('chat_id', 'is', null).eq('alerts_on', true),
    db.from('push_subscriptions').select('account_id, endpoint, p256dh, auth'),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  const push = new Map<string, PushRow[]>();
  for (const s of (subs ?? []) as PushRow[]) push.set(s.account_id, [...(push.get(s.account_id) ?? []), s]);
  return { telegram: new Set((links ?? []).map(l => l.account_id as string)), push };
}

/** Each account with its groups, their activities, its own alerts and zone (the prefs the app syncs). */
async function peopleOf(db: Db, accounts: string[]): Promise<AlertPerson[]> {
  if (accounts.length === 0) return [];
  const { data: rows, error } = await db.from('accounts').select('user_id, account_id').in('account_id', accounts);
  if (error) throw error;
  const { data: mine, error: mErr } = await db.from('group_members').select('group_id').in('account_id', accounts);
  if (mErr) throw mErr;
  const ids = [...new Set((mine ?? []).map(m => m.group_id as string))];
  const groups = await groupsOf(db, ids);
  const { data: acts, error: aErr } = ids.length ? await db.from('activities').select('doc').in('group_id', ids) : { data: [], error: null };
  if (aErr) throw aErr;
  const activities = (acts ?? []).map(r => r.doc as Activity);
  const people: AlertPerson[] = [];
  for (const r of rows ?? []) {
    const { data: u } = await db.auth.admin.getUserById(r.user_id as string);
    const prefs = (u.user?.user_metadata?.['memo_prefs'] ?? {}) as { alerts?: AlertPerson['alerts']; timeZone?: string };
    if (!prefs.alerts || Object.keys(prefs.alerts).length === 0) continue;
    people.push({ account: r.account_id as string, groups, activities, alerts: prefs.alerts, zone: prefs.timeZone ?? 'Europe/Rome' });
  }
  return people;
}

/** The groups as the central engine reads them (engine-central's `toGroup`). */
async function groupsOf(db: Db, ids: string[]): Promise<Group[]> {
  if (ids.length === 0) return [];
  const [{ data: rows, error: e1 }, { data: members, error: e2 }] = await Promise.all([
    db.from('groups').select('*').in('id', ids),
    db.from('group_members').select('*').in('group_id', ids),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  return (rows ?? []).map(r => {
    const g: Group = {
      id: r.id, kind: r.kind, name: r.name, timeZone: r.time_zone, version: r.version,
      members: Object.fromEntries((members ?? []).filter(m => m.group_id === r.id).map(m => [m.account_id, m.role])),
    };
    if (r.type === 'list') g.type = 'list';
    if (r.archived) g.archived = true;
    if (r.domain !== null) g.domain = r.domain;
    if (r.owner_id !== null) g.ownerId = r.owner_id;
    return g;
  });
}

/** Marks the alerts as sent and keeps those this run marked: two runs at once never send one twice. */
async function notSentYet(db: Db, account: string, due: AlertEntry[]): Promise<AlertEntry[]> {
  if (due.length === 0) return [];
  const byKey = new Map(due.map(e => [alertKey(e), e]));
  const { data, error } = await db.from('alerts_sent')
    .upsert([...byKey.keys()].map(key => ({ account_id: account, key })), { onConflict: 'account_id,key', ignoreDuplicates: true })
    .select('key');
  if (error) throw error;
  return (data ?? []).map(r => byKey.get(r.key as string)!).filter(Boolean);
}

/** The test pushes «Manda una prova» asked for (alerts_test): sent once, then cleared. */
async function sendTests(db: Db): Promise<number> {
  const { data, error } = await db.from('push_subscriptions').update({ test_at: null }).not('test_at', 'is', null)
    .select('account_id, endpoint, p256dh, auth');
  if (error) throw error;
  let n = 0;
  for (const s of (data ?? []) as PushRow[]) {
    if (await push(db, s, { title: 'memo-land', body: 'Prova: le notifiche arrivano su questo dispositivo.' })) n++;
  }
  return n;
}

/** A push to one device; one the push service no longer knows (404, 410) is forgotten. */
async function push(db: Db, s: PushRow, payload: Record<string, unknown>): Promise<boolean> {
  try {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 1800, urgency: 'high' });
    return true;
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
    return false;
  }
}

/** One alert on each channel on. */
async function deliver(db: Db, channels: Channels, account: string, e: AlertEntry): Promise<number> {
  let n = 0;
  if (channels.telegram.has(account)) {
    const { error } = await db.rpc('alerts_send_telegram', { account, body: e.text });
    if (!error) n++;
  }
  for (const s of channels.push.get(account) ?? []) {
    if (await push(db, s, { ...e.push, activityId: e.activityId, occurrence: e.time })) n++;
  }
  return n;
}

type Db = ReturnType<typeof createClient>;
