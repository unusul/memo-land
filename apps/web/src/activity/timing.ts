import { addUnits, fromFloating, toFloating } from '@attivita/core';
import type { DayTime, LocalDate, LocalDateTime, Repeat, Unit, Weekday } from '@attivita/core';

export type SnoozeUnit = 'minute' | 'hour' | Unit;
export type { Weekday };

/** What the repeat form collects; turned into a core Repeat by toRepeat. */
export interface RepeatSpec {
  mode: Repeat['mode'];
  every: number;
  unit: Unit;
  /** Weekly rules only; empty means the weekday of the start. */
  weekdays: Weekday[];
  /** Monthly calendar rules: the same day number, or the same weekday of the month (first Monday, last Friday). */
  monthly: 'day' | 'nth';
  /** Weekly calendar rules: the days with a time of their own; the others keep the schedule's. */
  times?: DayTimes;
}

export type DayTimes = Partial<Record<Weekday, DayTime>>;

export const WEEKDAYS: Array<[Weekday, string]> = [['MO', 'lun'], ['TU', 'mar'], ['WE', 'mer'], ['TH', 'gio'], ['FR', 'ven'], ['SA', 'sab'], ['SU', 'dom']];
const WEEKDAY_OF_DATE: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const LONG_DAY: Record<Weekday, string> = { MO: 'lunedì', TU: 'martedì', WE: 'mercoledì', TH: 'giovedì', FR: 'venerdì', SA: 'sabato', SU: 'domenica' };
const ORDINAL = ['', 'primo', 'secondo', 'terzo', 'quarto'];
const FREQ: Record<Unit, string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' };
const UNIT_OF_FREQ: Record<string, Unit> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' };

export const UNIT_NAMES: Record<SnoozeUnit, [string, string]> = {
  minute: ['minuto', 'minuti'], hour: ['ora', 'ore'], day: ['giorno', 'giorni'], week: ['settimana', 'settimane'],
  month: ['mese', 'mesi'], year: ['anno', 'anni'],
};

const plural = (n: number, unit: SnoozeUnit) => UNIT_NAMES[unit][n === 1 ? 0 : 1];

/** `count` units after `from`; minutes and hours cross midnight, months clamp to the end of the month. */
export function snoozeUntil(from: LocalDateTime, count: number, unit: SnoozeUnit): LocalDateTime {
  if (unit !== 'minute' && unit !== 'hour') return addUnits(from, unit, count);
  const d = toFloating(from);
  d.setUTCMinutes(d.getUTCMinutes() + count * (unit === 'hour' ? 60 : 1));
  return fromFloating(d, false);
}

export const describeSnooze = (count: number, unit: SnoozeUnit) => `tra ${count} ${plural(count, unit)}`;

export function toRepeat(spec: RepeatSpec, start: LocalDate | LocalDateTime): Repeat {
  if (spec.mode === 'fromCompletion') return { mode: 'fromCompletion', every: { unit: spec.unit, count: spec.every } };
  const parts = [`FREQ=${FREQ[spec.unit]}`, ...(spec.every > 1 ? [`INTERVAL=${spec.every}`] : [])];
  const days = spec.weekdays.length ? sortDays(spec.weekdays) : [weekdayOf(start)];
  if (spec.unit === 'week') parts.push(`BYDAY=${days.join(',')}`);
  if (spec.unit === 'month') parts.push(spec.monthly === 'nth' ? `BYDAY=${nthOf(start)}${weekdayOf(start)}` : `BYMONTHDAY=${toFloating(start).getUTCDate()}`);
  // Only the rule's own days keep a time: a day taken out of the rule takes its time away too.
  const times = spec.unit === 'week' ? Object.fromEntries(days.filter(d => spec.times?.[d]).map(d => [d, spec.times![d]!])) : {};
  return { mode: 'calendar', rrule: parts.join(';'), ...(Object.keys(times).length ? { times } : {}) };
}

/** The weekday of a date or date-time, as RRULE writes it. */
export const weekdayOf = (start: LocalDate | LocalDateTime) => WEEKDAY_OF_DATE[toFloating(start).getUTCDay()]!;

/** The form values for a stored rule, so it can be edited; null for a rule the form cannot express. */
export function specOf(r: Repeat): RepeatSpec | null {
  if (r.mode === 'fromCompletion') return { mode: r.mode, every: r.every.count, unit: r.every.unit, weekdays: [], monthly: 'day' };
  const rule = parseRule(r.rrule);
  const unit = UNIT_OF_FREQ[rule['FREQ'] ?? ''];
  if (!unit) return null;
  const byDay = rule['BYDAY']?.split(',') ?? [];
  const weekdays = unit === 'week' ? byDay.filter((d): d is Weekday => WEEKDAYS.some(([k]) => k === d)) : [];
  return {
    mode: 'calendar', every: Number(rule['INTERVAL'] ?? 1), unit, weekdays, monthly: unit === 'month' && byDay.length ? 'nth' : 'day',
    ...(r.times ? { times: r.times } : {}),
  };
}

const parseRule = (rrule: string): Record<string, string> => Object.fromEntries(rrule.split(';').map(p => p.split('=') as [string, string]));

/** Italian text for the rules this app writes; anything else falls back to the raw rule. */
export function describeRepeat(r: Repeat): string {
  if (r.mode === 'fromCompletion') return `${every(r.every.count, r.every.unit)} da quando la completi`;
  const rule = parseRule(r.rrule);
  const unit = UNIT_OF_FREQ[rule['FREQ'] ?? ''];
  if (!unit) return r.rrule;
  const head = every(Number(rule['INTERVAL'] ?? 1), unit);
  const byDay = rule['BYDAY']?.split(',') ?? [];
  if (unit === 'week' && byDay.length) return `${head}, ${joinIt(byDay.map(d => (WEEKDAYS.find(([k]) => k === d)?.[1] ?? d) + ownTime(r.times?.[d as Weekday])))}`;
  if (unit === 'month' && byDay.length === 1) return `${head}, ${nthText(byDay[0]!)}`;
  if (unit === 'month' && rule['BYMONTHDAY']) return `${head}, il ${rule['BYMONTHDAY'].replaceAll(',', ' e il ')}`;
  return head;
}

/** « 18:00–19:15» after a day with a time of its own; nothing for a day at the schedule's time. */
const ownTime = (t: DayTime | undefined) => (t ? ` ${t.start}${t.end ? `–${t.end}` : ''}` : '');

const every = (n: number, unit: Unit) => n === 1 ? `ogni ${UNIT_NAMES[unit][0]}` : `ogni ${n} ${plural(n, unit)}`;

function nthText(code: string): string {
  const m = /^([+-]?\d)([A-Z]{2})$/.exec(code);
  if (!m) return code;
  const n = Number(m[1]);
  return `${n < 0 ? 'l\'ultimo' : `il ${ORDINAL[n] ?? n}`} ${LONG_DAY[m[2] as Weekday] ?? m[2]}`;
}

const joinIt = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`;
const sortDays = (ds: Weekday[]) => WEEKDAYS.map(([k]) => k).filter(k => ds.includes(k));

/** Which occurrence of its weekday the start is: +1..+4, or -1 when it is the fifth (that is, the last). */
function nthOf(start: LocalDate | LocalDateTime): string {
  const n = Math.ceil(toFloating(start).getUTCDate() / 7);
  return n >= 5 ? '-1' : `+${n}`;
}
