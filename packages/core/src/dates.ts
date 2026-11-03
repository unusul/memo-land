import { fail } from './errors.js';
import type { LocalDate, LocalDateTime, Unit } from './types.js';

/**
 * Floating local values are mapped onto UTC Date objects so that arithmetic
 * never crosses a daylight-saving transition: 09:00 stays 09:00.
 */
const PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

export function isDateOnly(value: LocalDate | LocalDateTime): boolean {
  return value.length === 10;
}

export function toFloating(value: LocalDate | LocalDateTime): Date {
  const m = PATTERN.exec(value);
  if (!m) fail('INVALID_INPUT', `invalid local date-time "${value}"`);
  const [, y, mo, d, h = '00', mi = '00'] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  if (fromFloating(date, isDateOnly(value)) !== value) fail('INVALID_INPUT', `non-existent local date-time "${value}"`);
  return date;
}

/** Last minute of the value's day. */
export function endOfDay(value: LocalDate | LocalDateTime): LocalDateTime {
  return `${value.slice(0, 10)}T23:59`;
}

export function fromFloating(date: Date, dateOnly: boolean): LocalDate | LocalDateTime {
  const iso = date.toISOString();
  return dateOnly ? iso.slice(0, 10) : iso.slice(0, 16);
}

/** Comparable form: a date-only value counts as its midnight. */
export function asDateTime(value: LocalDate | LocalDateTime): LocalDateTime {
  return isDateOnly(value) ? `${value}T00:00` : value;
}

/** Adds calendar units; months and years clamp to the last day of the target month. */
export function addUnits(value: LocalDate | LocalDateTime, unit: Unit, count: number): LocalDate | LocalDateTime {
  const d = toFloating(value);
  if (unit === 'day' || unit === 'week') {
    d.setUTCDate(d.getUTCDate() + count * (unit === 'week' ? 7 : 1));
    return fromFloating(d, isDateOnly(value));
  }
  const months = unit === 'year' ? count * 12 : count;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  d.setUTCDate(Math.min(day, daysInMonth(d.getUTCFullYear(), d.getUTCMonth())));
  return fromFloating(d, isDateOnly(value));
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}
