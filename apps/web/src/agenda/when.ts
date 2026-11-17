import { anchorOf, occurrencesBetween } from '@attivita/core';
import type { Activity, LocalDate, LocalDateTime } from '@attivita/core';
import { addDays, dayParts, today } from '../dates.js';

/** «15 nov»: the day alone, for a row that does not sit under its day. */
export const shortDay = (day: LocalDate): string => { const p = dayParts(day); return `${p.day} ${p.month}`; };

/** «20 nov 18:00», or «20 nov» for a whole day. */
export const shortWhen = (start: LocalDate | LocalDateTime): string =>
  start.length > 10 ? `${shortDay(start.slice(0, 10))} ${start.slice(11)}` : shortDay(start);

/** How far ahead the next time of an activity is looked for. */
const NEXT_TIME_DAYS = 400;

/**
 * The next time still to come, «20 nov 18:00» or «20 nov»; nothing for an activity without a date (user's choice,
 * 2026-11-17: «giorno» there would say something false).
 */
export function nextTime(a: Activity): string | undefined {
  const from = today();
  const next = occurrencesBetween(a, `${from}T00:00`, `${addDays(from, NEXT_TIME_DAYS)}T23:59`).find(o => !o.done && !o.skipped && o.movedTo === undefined);
  return next ? shortWhen(next.start) : undefined;
}

/** The next time, or the date it had when it is past (a task overdue still says its day). */
export const whenOf = (a: Activity): string | undefined => {
  const anchor = anchorOf(a);
  return nextTime(a) ?? (anchor === undefined ? undefined : shortWhen(anchor));
};
