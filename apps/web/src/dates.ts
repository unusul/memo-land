import type { Instant, LocalDate, LocalDateTime } from '@attivita/core';

const pad = (n: number) => String(n).padStart(2, '0');

/** Device-local wall clock as a floating value, the same convention the core uses. */
export function localNow(d = new Date()): LocalDateTime {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const today = (): LocalDate => localNow().slice(0, 10);

export const instantNow = (): Instant => new Date().toISOString();

export function addDays(day: LocalDate, n: number): LocalDate {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const DAY = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
const MONTH = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

export function dayParts(day: LocalDate): { weekday: string; day: number; month: string } {
  const d = new Date(`${day}T00:00:00Z`);
  return { weekday: DAY[d.getUTCDay()]!, day: d.getUTCDate(), month: MONTH[d.getUTCMonth()]! };
}

export const newId = (): string => crypto.randomUUID();
