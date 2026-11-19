import { buildAgenda } from '@attivita/core';
import type { AccountId, AgendaSource, GroupId } from '@attivita/core';
import { addDays, localNow } from '../dates.js';
import { alertListOf } from '../groups/barPrefs.js';
import type { ActivityAlert, AlertAt } from '../groups/barPrefs.js';

/** One message for Telegram: when (an instant) and what it says. */
export interface Alert { at: string; text: string }

/**
 * An alert with what it is about, for Prossime notifiche (2026-11-19): the event's local time, its title with the
 * group, and which alert of the bell it is. Only `at` and `text` go to the server.
 */
export interface AlertEntry extends Alert { time: string; what: string; of: AlertAt['of']; before: number }

/** Which alerts the person wants (Impostazioni → Avvisi su Telegram). */
export interface AlertChoice { start: boolean; end: boolean }

/**
 * No alert by itself (user's choice, 2026-11-19): only what the person sets with the bell. Before, everything with a
 * time alerted at its start, from two switches in Impostazioni.
 */
export const NO_GENERAL: AlertChoice = { start: false, end: false };

/** How far ahead the app hands alerts to the server: the next week. */
export const ALERT_DAYS = 7;
/** The server keeps at most this many; the nearest first. */
export const MAX_ALERTS = 300;

const hhmm = (t: string) => t.slice(11, 16);

/**
 * The alerts of the next days (user's choices, 2026-11-18, lite version): at the start of what has a time, and at the
 * end of what has an end, for what is the person's or nobody's; not for someone else's, nor for a time done, skipped or
 * moved away. Those already past are left out.
 * «Ora, 18:00: Riunione · esempio.it», «Scade ora, 18:00: …» for a due time, «Finisce ora, 19:00: …».
 * An activity's own choice (`own`, from the bell's panel) takes the place of `choice`: a list of alerts, each at the
 * start or at the end and some minutes before («Tra 20 minuti, 18:00: …», «Finisce tra 15 minuti, 19:00: …»); it
 * counts for someone else's activity too: the person asked for it.
 */
export function alertsFor(sources: AgendaSource[], meIn: (groupId: GroupId) => AccountId, choice: AlertChoice, now = new Date(),
  own: (activityId: string) => ActivityAlert | undefined = () => undefined): Alert[] {
  return alertEntries(sources, meIn, choice, now, own).map(({ at, text }) => ({ at, text }));
}

/** The same alerts as `alertsFor`, each with what it is about. */
export function alertEntries(sources: AgendaSource[], meIn: (groupId: GroupId) => AccountId, choice: AlertChoice, now = new Date(),
  own: (activityId: string) => ActivityAlert | undefined = () => undefined): AlertEntry[] {
  // From the start of today: a date without an hour starts there, and today's alerts on it may still be ahead.
  const from = `${localNow(now).slice(0, 10)}T00:00`;
  const to = localNow(new Date(now.getTime() + ALERT_DAYS * 86_400_000));
  const byId = new Map(sources.flatMap(s => s.activities.map(a => [a.id, a] as const)));
  const groupName = new Map(sources.map(s => [s.group.id, s.group.name] as const));
  const alerts: AlertEntry[] = [];
  for (const items of Object.values(buildAgenda(sources, from, to).days)) {
    for (const it of items) {
      if (it.done || it.skipped || it.movedTo) continue;
      const dateOnly = it.start.length <= 10;
      const mine = alertListOf(own(it.activityId), choice);
      if (!mine && it.assignee !== undefined && it.assignee !== meIn(it.groupId)) continue;
      const list: AlertAt[] = mine ?? [
        ...(choice.start ? [{ of: 'start' as const, before: 0 }] : []),
        ...(choice.end ? [{ of: 'end' as const, before: 0 }] : []),
      ];
      const where = groupName.get(it.groupId);
      const what = `${it.title}${where ? ` · ${where}` : ''}`;
      const due = byId.get(it.activityId)?.props.schedule === undefined;
      for (const { of, before, at: hour } of list) {
        if (of === 'day') {
          // A local date-time of this device, as the rest of the app reads its times.
          const at = new Date(`${addDays(it.start.slice(0, 10), -before)}T${hour ?? DAY_HOUR}`);
          if (at <= now) continue;
          const lead = dayLead(before, due);
          alerts.push({ at: at.toISOString(), text: `${lead}${dateOnly ? '' : `, ${hhmm(it.start)}`}: ${what}`, time: it.start, what, of, before });
          continue;
        }
        const time = of === 'start' ? it.start : it.end;
        if (!time || dateOnly) continue;
        // A local date-time of this device read as the rest of the app reads its times.
        const at = new Date(new Date(time).getTime() - before * 60_000);
        if (at <= now) continue;
        alerts.push({ at: at.toISOString(), text: `${alertLead(of, before, due)}, ${hhmm(time)}: ${what}`, time, what, of, before });
      }
    }
  }
  return alerts.sort((x, y) => x.at.localeCompare(y.at)).slice(0, MAX_ALERTS);
}

/** «tra 20 minuti», «tra 1 ora», «tra 2 ore», «domani», «tra 3 giorni»: how far the time is when the alert goes. */
export function beforeText(minutes: number): string {
  if (minutes % 1440 === 0) return minutes === 1440 ? 'domani' : `tra ${minutes / 1440} giorni`;
  if (minutes % 60 === 0) return minutes === 60 ? 'tra 1 ora' : `tra ${minutes / 60} ore`;
  return minutes === 1 ? 'tra 1 minuto' : `tra ${minutes} minuti`;
}

/** The hour a `day` alert starts with, and the one it takes when it has none. */
export const DAY_HOUR = '09:00';
const clock = (t: string) => t.replace(/^0(\d)/, '$1');

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
