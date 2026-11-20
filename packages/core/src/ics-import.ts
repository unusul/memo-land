import { RRule } from 'rrule';
import { localIn, instantIn } from './alerts.js';
import { addUnits, asDateTime, fromFloating, isDateOnly, toFloating } from './dates.js';
import type { IcsEvent, IcsTime } from './ics.js';
import { anchorOf } from './occurrences.js';
import { setProp } from './props.js';
import { newActivity } from './shape.js';
import type { AccountId, Activity, GroupId, Instant, LocalDate, LocalDateTime, OccurrenceOverride } from './types.js';

/*
 * Google Calendar events into activities (user's choices, 2026-11-20): a file at a time into one group, only what still
 * counts from today (future events, series with a time to come), the doubles of the group skipped by title and start,
 * reminders not imported, times in the group's zone. A zone the device does not know skips the event.
 */

export interface IcsImportInput {
  events: IcsEvent[];
  groupId: GroupId;
  /** The group's zone: every time is read in it. */
  zone: string;
  /** The activities already in the group, for the doubles. */
  existing: Activity[];
  today: LocalDate;
  accountId: AccountId;
  now: Instant;
  newId: () => string;
}

export interface IcsImportPlan {
  activities: Activity[];
  /** Same title and start as an activity of the group, or as an earlier event of the file. */
  duplicates: number;
  past: number;
  unknownZone: number;
  cancelled: number;
  /** Events kept that had a reminder on Google: it is not imported. */
  withAlarms: number;
}

/** What one event becomes, or why it is left out. */
type Outcome = Activity | 'past' | 'unknownZone' | 'cancelled';

export function planIcsImport(input: IcsImportInput): IcsImportPlan {
  const plan: IcsImportPlan = { activities: [], duplicates: 0, past: 0, unknownZone: 0, cancelled: 0, withAlarms: 0 };
  const seen = new Set(input.existing.map(doubleKey));
  const exceptions = input.events.filter(e => e.recurrenceId !== undefined);
  const masters = new Set(input.events.filter(e => e.rrule !== undefined).map(e => e.uid));
  for (const e of input.events.filter(ev => ev.recurrenceId === undefined || !masters.has(ev.uid))) {
    const outcome = toActivity(e, exceptions.filter(x => x.uid === e.uid && e.rrule !== undefined), input);
    if (typeof outcome === 'string') plan[outcome]++;
    else if (seen.has(doubleKey(outcome))) plan.duplicates++;
    else keep(plan, seen, outcome, e.hasAlarm);
  }
  return plan;
}

function keep(plan: IcsImportPlan, seen: Set<string>, a: Activity, hasAlarm: boolean): void {
  seen.add(doubleKey(a));
  plan.activities.push(a);
  if (hasAlarm) plan.withAlarms++;
}

function doubleKey(a: Activity): string {
  return `${a.title.trim().toLowerCase()}|${anchorOf(a) ?? ''}`;
}

function toActivity(e: IcsEvent, exceptions: IcsEvent[], input: IcsImportInput): Outcome {
  if (e.cancelled) return 'cancelled';
  if (!e.start) return 'past';
  const start = inZone(e.start, input.zone);
  const end = e.end && inZone(e.end, input.zone);
  if (start === null || end === null) return 'unknownZone';
  const repeat = e.rrule ? seriesRule(e.rrule, input.zone) : undefined;
  const last = lastDay(start, end);
  if (repeat ? !hasTimeFrom(repeat.rrule, start, repeat.until, input.today) : last < input.today) return 'past';
  const a = withTimes(newActivity({ id: input.newId(), accountId: input.accountId, title: e.summary.trim() || 'Senza titolo',
    body: bodyOf(e, start, end), groupId: input.groupId }, input.now), start, end, repeat, input);
  return { ...a, overrides: overridesOf(e, exceptions, start, input.zone) };
}

function withTimes(a: Activity, start: string, end: string | undefined, repeat: SeriesRule | undefined, input: IcsImportInput): Activity {
  const by = input.accountId;
  const timed = isDateOnly(start)
    ? setProp(a, 'due', start, by, input.now)
    : setProp(a, 'schedule', end && !isDateOnly(end) && end > start ? { start, end } : { start }, by, input.now);
  if (!repeat) return timed;
  return setProp(timed, 'repeat', { mode: 'calendar', rrule: repeat.rrule, ...(repeat.until ? { until: repeat.until } : {}) }, by, input.now);
}

/** The time in the group's zone, as a whole day or «YYYY-MM-DDTHH:mm»; null when the event's zone is unknown. */
export function inZone(t: IcsTime, zone: string): LocalDate | LocalDateTime | null {
  if (isDateOnly(t.value)) return t.value;
  try {
    if (t.utc) return localIn(zone, new Date(`${t.value}:00Z`));
    if (t.zone && t.zone !== zone) return localIn(zone, instantIn(t.zone, t.value));
    return t.value;
  } catch {
    return null;
  }
}

/** The last day the event takes: a whole-day end is the day after (the file's end is exclusive). */
function lastDay(start: string, end: string | undefined): LocalDate {
  if (end === undefined || end <= start) return start.slice(0, 10);
  return (isDateOnly(end) ? addUnits(end, 'day', -1) : end).slice(0, 10);
}

interface SeriesRule {
  rrule: string;
  until?: LocalDate;
}

/** The rule without its UNTIL, which becomes the series' last day in the group's zone. */
function seriesRule(rrule: string, zone: string): SeriesRule {
  const parts = rrule.replace(/^RRULE:/i, '').split(';').filter(p => p !== '');
  const until = parts.find(p => /^UNTIL=/i.test(p));
  const rule = parts.filter(p => p !== until).join(';');
  if (!until) return { rrule: rule };
  const day = untilDay(until.slice(6), zone);
  return day ? { rrule: rule, until: day.slice(0, 10) } : { rrule: rule };
}

function untilDay(v: string, zone: string): string | null {
  const value = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (v.length === 8) return value;
  const time = { value: `${value}T${v.slice(9, 11)}:${v.slice(11, 13)}`, ...(v.endsWith('Z') ? { utc: true as const } : {}) };
  return inZone(time, zone);
}

/** True when the series has a time on `today` or later, within its last day. */
function hasTimeFrom(rrule: string, start: string, until: LocalDate | undefined, today: LocalDate): boolean {
  const rule = new RRule({ ...RRule.parseString(rrule), dtstart: toFloating(start) });
  const next = rule.after(toFloating(asDateTime(today)), true);
  if (next === null) return false;
  return until === undefined || fromFloating(next, true) <= until;
}

/** Days taken out of the series (EXDATE) and its changed or cancelled times, under the time they replace. */
function overridesOf(e: IcsEvent, exceptions: IcsEvent[], start: string, zone: string): Record<string, OccurrenceOverride> {
  const keyOf = (t: IcsTime) => inZone(t, zone)?.slice(0, isDateOnly(start) ? 10 : 16);
  const overrides: Record<string, OccurrenceOverride> = {};
  for (const key of e.exdates.map(keyOf)) if (key) overrides[key] = { skipped: true };
  for (const x of exceptions) {
    const key = x.recurrenceId && keyOf(x.recurrenceId);
    const moved = x.start && inZone(x.start, zone)?.slice(0, isDateOnly(start) ? 10 : 16);
    if (!key) continue;
    if (x.cancelled) overrides[key] = { skipped: true };
    else if (moved && moved !== key) overrides[key] = { moved };
  }
  return overrides;
}

/** The description as text, then the place, the video call and, for days in a row, the last one. */
function bodyOf(e: IcsEvent, start: string, end: string | undefined): string {
  const last = lastDay(start, end);
  return [
    plainText(e.description),
    e.location ? `Luogo: ${e.location}` : '',
    e.conference ? `Videochiamata: ${e.conference}` : '',
    isDateOnly(start) && last > start ? `Fino al ${last}` : '',
  ].filter(s => s !== '').join('\n\n');
}

/** Google writes descriptions in HTML: line breaks kept, tags dropped, the usual entities read. */
function plainText(html: string): string {
  const entities: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ' };
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, m => entities[m] ?? m).trim();
}
