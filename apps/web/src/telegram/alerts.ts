import { buildAgenda } from '@attivita/core';
import type { AccountId, AgendaSource, GroupId } from '@attivita/core';
import { localNow } from '../dates.js';
import type { ActivityAlert } from '../groups/barPrefs.js';

/** One message for Telegram: when (an instant) and what it says. */
export interface Alert { at: string; text: string }

/** Which alerts the person wants (Impostazioni → Avvisi su Telegram). */
export interface AlertChoice { start: boolean; end: boolean }

/** How far ahead the app hands alerts to the server: the next week. */
export const ALERT_DAYS = 7;
/** The server keeps at most this many; the nearest first. */
export const MAX_ALERTS = 300;

const hhmm = (t: string) => t.slice(11, 16);
/** A local date-time of this device as an instant, as the rest of the app reads its times. */
const instantOf = (t: string) => new Date(t).toISOString();

/**
 * The alerts of the next days (user's choices, 2026-11-18, lite version): at the start of what has a time, and at the
 * end of what has an end, for what is the person's or nobody's; not for someone else's, nor for a time done, skipped or
 * moved away. Those already past are left out.
 * «Ora, 18:00: Riunione · esempio.it», «Scade ora, 18:00: …» for a due time, «Finisce ora, 19:00: …».
 * An activity's own choice (`own`, from its detail) takes the place of `choice`, adds «Tra 30 minuti, 18:00: …» before
 * the start, and counts for someone else's activity too: the person asked for it.
 */
export function alertsFor(sources: AgendaSource[], meIn: (groupId: GroupId) => AccountId, choice: AlertChoice, now = new Date(),
  own: (activityId: string) => ActivityAlert | undefined = () => undefined): Alert[] {
  const from = localNow(now);
  const to = localNow(new Date(now.getTime() + ALERT_DAYS * 86_400_000));
  const byId = new Map(sources.flatMap(s => s.activities.map(a => [a.id, a] as const)));
  const groupName = new Map(sources.map(s => [s.group.id, s.group.name] as const));
  const alerts: Alert[] = [];
  for (const items of Object.values(buildAgenda(sources, from, to).days)) {
    for (const it of items) {
      if (it.start.length <= 10 || it.done || it.skipped || it.movedTo) continue;
      const mine = own(it.activityId);
      if (!mine && it.assignee !== undefined && it.assignee !== meIn(it.groupId)) continue;
      const when = mine?.when;
      const start = when ? when === 'start' || when === 'both' : choice.start;
      const end = when ? when === 'end' || when === 'both' : choice.end;
      const where = groupName.get(it.groupId);
      const what = `${it.title}${where ? ` · ${where}` : ''}`;
      const due = byId.get(it.activityId)?.props.schedule === undefined;
      if (start && it.start > from) alerts.push({ at: instantOf(it.start), text: `${due ? 'Scade ora' : 'Ora'}, ${hhmm(it.start)}: ${what}` });
      if (end && it.end && it.end > from) alerts.push({ at: instantOf(it.end), text: `Finisce ora, ${hhmm(it.end)}: ${what}` });
      if (mine?.before && when !== 'none') {
        const at = new Date(new Date(it.start).getTime() - mine.before * 60_000);
        if (at > now) alerts.push({ at: at.toISOString(), text: `${beforeText(mine.before)}, ${hhmm(it.start)}: ${what}` });
      }
    }
  }
  return alerts.sort((x, y) => x.at.localeCompare(y.at)).slice(0, MAX_ALERTS);
}

/** «Tra 10 minuti», «Tra 1 ora», «Domani»: how far the start is when the alert before it goes. */
export function beforeText(minutes: number): string {
  if (minutes >= 1440) return 'Domani';
  if (minutes >= 60) return minutes === 60 ? 'Tra 1 ora' : `Tra ${minutes / 60} ore`;
  return `Tra ${minutes} minuti`;
}
