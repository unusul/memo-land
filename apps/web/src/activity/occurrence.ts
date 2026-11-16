import { occurrencesBetween } from '@attivita/core';
import type { Activity, LocalDate, LocalDateTime, Occurrence } from '@attivita/core';
import { shortDay } from './DatePicker.js';

/** «ven 6 nov alle 20:00», or «ven 6 nov» for a day. */
export function whenText(at: LocalDate | LocalDateTime): string {
  return at.length > 10 ? `${shortDay(at.slice(0, 10))} alle ${at.slice(11, 16)}` : shortDay(at);
}

/** What each row of a moved occurrence says: where it went, on the day it left; where it came from, on the new day. */
export function movedNote(o: Occurrence): string | undefined {
  if (o.movedTo !== undefined) return `spostata a ${whenText(o.movedTo)}`;
  if (o.movedFrom !== undefined) return `spostata da ${shortDay(o.movedFrom.slice(0, 10))}`;
  return undefined;
}

/**
 * The occurrence an agenda row points at, by the start the row shows: a time is that very start, a day any start of that
 * day. A moved occurrence has two rows with one key, the day it left and the day it went to: the start tells them apart.
 */
export function occurrenceAt(a: Activity, key: string | undefined): Occurrence | null {
  if (!key) return null;
  const timed = key.length > 10;
  const found = occurrencesBetween(a, timed ? key : `${key}T00:00`, timed ? key : `${key}T23:59`);
  return found.find(o => o.start === key) ?? found[0] ?? null;
}
