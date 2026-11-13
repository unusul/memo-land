import { occurrencesBetween } from '@attivita/core';
import type { Activity, Occurrence } from '@attivita/core';

/** The occurrence an agenda row points at: a time key is that very start, a day key is any start of that day. */
export function occurrenceAt(a: Activity, key: string | undefined): Occurrence | null {
  if (!key) return null;
  const timed = key.length > 10;
  return occurrencesBetween(a, timed ? key : `${key}T00:00`, timed ? key : `${key}T23:59`)[0] ?? null;
}
