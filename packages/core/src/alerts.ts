import { buildAgenda } from './agenda.js';
import { addUnits } from './dates.js';
import type { AgendaSource } from './agenda.js';
import type { Group } from './groups.js';
import { resumeIfDue } from './triage.js';
import type { AccountId, Activity, GroupId, Instant, LocalDate, LocalDateTime } from './types.js';

/*
 * The alerts of a person's activities, in the core since 2026-11-19 so the server computes them too (an Edge Function,
 * with the same code as the app): before, only the app computed them and handed them to the server, so a change made
 * by someone else arrived only when the person opened the app. Times are floating, as everywhere in the core; the time
 * zone turns them into instants, the device's in the app, the person's on the server.
 */

/**
 * One alert of the bell's panel (user's choices, 2026-11-18/19): at the start or at the end, `before` minutes before
 * (0: at the time); or `day`, for what has a date without an hour too: `before` days before its day, at the hour `at`
 * («HH:MM»).
 */
export interface AlertAt { of: 'start' | 'end' | 'day'; before: number; at?: string }
/**
 * The person's own alerts for an activity: `none`, or a list, at most five. Theirs only, as «In evidenza»; absent, the
 * activity follows Impostazioni. Saved by 0.16.0 as { when, before }: read through `alertListOf`.
 */
export interface ActivityAlert { mode?: 'here' | 'none'; list?: AlertAt[]; when?: 'start' | 'both' | 'end' | 'none'; before?: number }
export const MAX_ACTIVITY_ALERTS = 5;

/** Which alerts the person wants by default, at the time of the start and of the end. */
export interface AlertChoice { start: boolean; end: boolean }
/**
 * No alert by itself (user's choice, 2026-11-19): only what the person sets with the bell. Before, everything with a
 * time alerted at its start, from two switches in Impostazioni.
 */
export const NO_GENERAL: AlertChoice = { start: false, end: false };

/** One message: when (an instant) and what it says. */
export interface Alert { at: string; text: string }
/**
 * An alert with what it is about: the event's local time, its title with the group, and which alert it is; the
 * activity and the occurrence, and the words of the push (user's choice, 2026-11-19: the title, then «tra 15 minuti ·
 * 10:00–11:00 · esempio.it»; a tap opens the activity).
 */
export interface AlertEntry extends Alert {
  time: string; what: string; of: AlertAt['of']; before: number;
  activityId: string; push: { title: string; body: string };
}

/** How far ahead alerts are computed: the next week. */
export const ALERT_DAYS = 7;
/** At most this many; the nearest first. */
export const MAX_ALERTS = 300;
/** The hour a `day` alert starts with, and the one it takes when it has none. */
export const DAY_HOUR = '09:00';

/**
 * The alerts an activity's own choice asks for: null when it follows Impostazioni (`general`, at the time of the start
 * and of the end), [] for none. A choice saved by 0.16.0 without `when` kept Impostazioni and added `before`.
 */
export function alertListOf(a: ActivityAlert | undefined, general: AlertChoice): AlertAt[] | null {
  if (!a) return null;
  if (a.mode === 'none' || a.when === 'none') return [];
  if (a.mode === 'here') return (a.list ?? []).slice(0, MAX_ACTIVITY_ALERTS);
  const start = a.when ? a.when === 'start' || a.when === 'both' : general.start;
  const end = a.when ? a.when === 'end' || a.when === 'both' : general.end;
  const list: AlertAt[] = [];
  if (start) list.push({ of: 'start', before: 0 });
  if (end) list.push({ of: 'end', before: 0 });
  if (a.before) list.push({ of: 'start', before: a.before });
  return list;
}

/**
 * The alerts of the next days (user's choices, 2026-11-18): at the start of what has a time, and at the end of what has
 * an end, for what is the person's or nobody's; not for someone else's, nor for a time done, skipped or moved away.
 * Those already past are left out. «Ora, 18:00: Riunione · esempio.it», «Scade ora, 18:00: …» for a due time,
 * «Finisce ora, 19:00: …». An activity's own choice (`own`, from the bell's panel) takes the place of `choice`, and
 * counts for someone else's activity too: the person asked for it. `zone` is an IANA time zone, «Europe/Rome».
 */
export function alertEntries(sources: AgendaSource[], meIn: (groupId: GroupId) => AccountId, choice: AlertChoice, now: Date,
  own: (activityId: string) => ActivityAlert | undefined, zone: string): AlertEntry[] {
  // From the start of today: a date without an hour starts there, and today's alerts on it may still be ahead.
  const from = `${localIn(zone, now).slice(0, 10)}T00:00`;
  const to = localIn(zone, new Date(now.getTime() + ALERT_DAYS * 86_400_000));
  const byId = new Map(sources.flatMap(s => s.activities.map(a => [a.id, a] as const)));
  const groupName = new Map(sources.map(s => [s.group.id, s.group.name] as const));
  const alerts: AlertEntry[] = [];
  for (const items of Object.values(buildAgenda(sources, from, to).days)) {
    for (const it of items) {
      if (it.done || it.skipped || it.movedTo) continue;
      const mine = alertListOf(own(it.activityId), choice);
      if (!mine && it.assignee !== undefined && it.assignee !== meIn(it.groupId)) continue;
      const list: AlertAt[] = mine ?? [
        ...(choice.start ? [{ of: 'start' as const, before: 0 }] : []),
        ...(choice.end ? [{ of: 'end' as const, before: 0 }] : []),
      ];
      const due = byId.get(it.activityId)?.props.schedule === undefined;
      for (const alert of list) {
        const entry = entryOf(alert, it, groupName.get(it.groupId), due, zone);
        if (entry && new Date(entry.at) > now) alerts.push(entry);
      }
    }
  }
  return alerts.sort((x, y) => x.at.localeCompare(y.at)).slice(0, MAX_ALERTS);
}

/** One alert of one occurrence, or undefined when it has no time to go off at (an end that is not there). */
function entryOf({ of, before, at: hour }: AlertAt, it: { activityId: string; title: string; start: string; end?: string | undefined },
  group: string | undefined, due: boolean, zone: string): AlertEntry | undefined {
  const { start, end } = it;
  const dateOnly = start.length <= 10;
  const what = `${it.title}${group ? ` · ${group}` : ''}`;
  const about = { what, of, before, activityId: it.activityId };
  // The push says the event's hours, «10:00–11:00»; at its end only that it ends, «finisce ora · esempio.it».
  const hours = dateOnly || of === 'end' ? '' : end && end.length > 10 ? `${hhmm(start)}–${hhmm(end)}` : hhmm(start);
  const push = (lead: string) => ({ title: it.title, body: [lead.charAt(0).toLowerCase() + lead.slice(1), hours, group].filter(Boolean).join(' · ') });
  if (of === 'day') {
    const day = addUnits(start.slice(0, 10), 'day', -before) as LocalDate;
    const at = instantIn(zone, `${day}T${hour ?? DAY_HOUR}`);
    const lead = dayLead(before, due);
    return { at: at.toISOString(), text: `${lead}${dateOnly ? '' : `, ${hhmm(start)}`}: ${what}`, time: start, ...about, push: push(lead) };
  }
  const time = of === 'start' ? start : end;
  if (!time || dateOnly) return undefined;
  const at = new Date(instantIn(zone, time).getTime() - before * 60_000);
  const lead = alertLead(of, before, due);
  return { at: at.toISOString(), text: `${lead}, ${hhmm(time)}: ${what}`, time, ...about, push: push(lead) };
}

/** How late an alert may still go: one the server missed by more (it was down) is dropped, not sent late. */
export const ALERT_LATE_MS = 30 * 60_000;

/** One person as the server sees them: their groups and activities, their own alerts (`alerts` in the prefs), their zone. */
export interface AlertPerson {
  account: AccountId; groups: Group[]; activities: Activity[];
  alerts: Record<string, ActivityAlert>; zone: string;
}

/**
 * The groups with their activities as the agenda sees them at `now`: an archived group is out (nobody works on it any
 * more), snoozed activities whose time has come are back. The app's Agenda and the server read them alike.
 */
export function agendaSources(groups: Group[], activities: Activity[], today: LocalDateTime, now: Instant): AgendaSource[] {
  return groups.filter(g => !g.archived).map(group => ({
    group, activities: activities.filter(a => a.groupId === group.id).map(a => resumeIfDue(a, today, now)),
  }));
}

/**
 * The alerts of a person due at `now` on the server (2026-11-19): those whose time came in the last `ALERT_LATE_MS`,
 * computed as the app computes them, in the person's zone, from the groups they belong to. Which ones already went is
 * the server's to know, by `alertKey`.
 */
export function dueAlerts(p: AlertPerson, now: Date): AlertEntry[] {
  const mine = p.groups.filter(g => g.members[p.account] !== undefined);
  const sources = agendaSources(mine, p.activities, localIn(p.zone, now), now.toISOString());
  const since = new Date(now.getTime() - ALERT_LATE_MS);
  return alertEntries(sources, () => p.account, NO_GENERAL, since, id => p.alerts[id], p.zone).filter(e => new Date(e.at) <= now);
}

/** Which alert it is, to send it once: the activity, the alert of the bell, and when it goes. */
export const alertKey = (e: Pick<AlertEntry, 'activityId' | 'of' | 'before' | 'at'>): string => `${e.activityId}|${e.of}|${e.before}|${e.at}`;

const hhmm = (t: string) => t.slice(11, 16);
const clock = (t: string) => t.replace(/^0(\d)/, '$1');

/** «tra 20 minuti», «tra 1 ora», «tra 2 ore», «domani», «tra 3 giorni»: how far the time is when the alert goes. */
export function beforeText(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'domani' : `tra ${minutes / 1440} giorni`;
  if (minutes % 60 === 0) return minutes === 60 ? 'tra 1 ora' : `tra ${minutes / 60} ore`;
  return minutes === 1 ? 'tra 1 minuto' : `tra ${minutes} minuti`;
}

/**
 * «all'inizio», «alla fine», «15 minuti prima dell'inizio», «1 ora prima della fine», «1 giorno prima dell'inizio»;
 * «il giorno stesso alle 9:00», «il giorno prima alle 18:00», «2 giorni prima alle 18:00».
 */
export function alertWords({ of, before, at }: AlertAt): string {
  if (of === 'day') {
    const day = before === 0 ? 'il giorno stesso' : before === 1 ? 'il giorno prima' : `${before} giorni prima`;
    return `${day} alle ${clock(at ?? DAY_HOUR)}`;
  }
  if (before === 0) return of === 'start' ? "all'inizio" : 'alla fine';
  const ahead = beforeText(before).replace(/^tra /, '').replace(/^domani$/, '1 giorno');
  return `${ahead} prima ${of === 'start' ? "dell'inizio" : 'della fine'}`;
}

/** How a `day` alert starts: «Scade oggi», «Scade domani», «Scade tra 3 giorni»; «Oggi», «Domani», «Tra 3 giorni». */
function dayLead(before: number, due: boolean): string {
  const when = before === 0 ? 'oggi' : before === 1 ? 'domani' : `tra ${before} giorni`;
  return due ? `Scade ${when}` : when.charAt(0).toUpperCase() + when.slice(1);
}

/** How a message starts: «Ora», «Scade ora», «Finisce ora», «Tra 20 minuti», «Scade domani», «Finisce tra 15 minuti». */
function alertLead(of: 'start' | 'end', before: number, due: boolean): string {
  const when = before === 0 ? 'ora' : beforeText(before);
  if (of === 'end') return `Finisce ${when}`;
  if (due) return `Scade ${when}`;
  return before === 0 ? 'Ora' : when.charAt(0).toUpperCase() + when.slice(1);
}

const HOUR_MS = 3_600_000;
const formats = new Map<string, Intl.DateTimeFormat>();
function formatIn(zone: string): Intl.DateTimeFormat {
  let f = formats.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    formats.set(zone, f);
  }
  return f;
}

/** The wall clock of `zone` at the instant `d`, «2026-11-19T18:00». */
export function localIn(zone: string, d: Date): LocalDateTime {
  const p = Object.fromEntries(formatIn(zone).formatToParts(d).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * The instant a wall-clock time of `zone` stands for, as `new Date(local)` reads it in a device set to that zone: an
 * hour that happens twice (the autumn change) is the first one; an hour that does not exist (the spring change) is read
 * with the offset before the change, so 02:30 becomes 03:30.
 */
export function instantIn(zone: string, local: LocalDateTime): Date {
  const wall = Date.UTC(Number(local.slice(0, 4)), Number(local.slice(5, 7)) - 1, Number(local.slice(8, 10)), Number(local.slice(11, 13)), Number(local.slice(14, 16)));
  const offsetAt = (t: number) => Date.UTC(...partsOf(zone, t)) - Math.floor(t / 60_000) * 60_000;
  const before = offsetAt(wall - 12 * HOUR_MS);
  const after = offsetAt(wall + 12 * HOUR_MS);
  const fits = [before, after].map(o => wall - o).filter(t => localIn(zone, new Date(t)) === local.slice(0, 16));
  return new Date(fits.length > 0 ? Math.min(...fits) : wall - before);
}

function partsOf(zone: string, t: number): [number, number, number, number, number] {
  const local = localIn(zone, new Date(t));
  return [Number(local.slice(0, 4)), Number(local.slice(5, 7)) - 1, Number(local.slice(8, 10)), Number(local.slice(11, 13)), Number(local.slice(14, 16))];
}
