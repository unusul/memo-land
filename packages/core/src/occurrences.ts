import { RRule } from 'rrule';
import { completedKeys, nextDue } from './completion.js';
import { asDateTime, fromFloating, isDateOnly, toFloating } from './dates.js';
import { fail } from './errors.js';
import { touch } from './props.js';
import type { AccountId, Activity, ActivityId, Instant, LocalDate, LocalDateTime, OccurrenceKey, Role } from './types.js';

export interface Occurrence {
  activityId: ActivityId;
  key: OccurrenceKey;
  start: LocalDateTime | LocalDate;
  end?: LocalDateTime;
  assignee?: AccountId;
  /** Set when someone else covers this occurrence for the series assignee. */
  coveredFor?: AccountId;
  /** Set when this occurrence of a calendar series has been completed. */
  done?: true;
}

export function anchorOf(a: Activity): LocalDate | LocalDateTime | undefined {
  return a.props.schedule?.start ?? a.props.due;
}

export function occurrencesBetween(a: Activity, from: LocalDateTime, to: LocalDateTime): Occurrence[] {
  const anchor = anchorOf(a);
  if (anchor === undefined) return [];
  const done = completedKeys(a);
  return startsOf(a, anchor, from, to).filter(s => inRange(s, from, to)).map(s => toOccurrence(a, s, done));
}

function startsOf(a: Activity, anchor: LocalDate | LocalDateTime, from: LocalDateTime, to: LocalDateTime): Array<LocalDate | LocalDateTime> {
  const repeat = a.props.repeat;
  if (repeat?.mode === 'calendar') return calendarStarts(repeat.rrule, anchor, from, to);
  if (repeat?.mode === 'fromCompletion') return [nextDue(a) ?? anchor];
  return [anchor];
}

export function takeOccurrence(a: Activity, key: OccurrenceKey, by: AccountId, byRole: Role, now: Instant): Activity {
  if (byRole === 'guest') fail('FORBIDDEN', 'guests cannot take occurrences');
  if (!isOccurrence(a, key)) fail('INVALID_INPUT', `"${key}" is not an occurrence of this activity`);
  const overrides = { ...a.overrides, [key]: { assignee: by, takenBy: by } };
  return touch({ ...a, overrides }, { kind: 'occurrenceTaken', detail: { key } }, by, now);
}

export function isOccurrence(a: Activity, key: OccurrenceKey): boolean {
  return occurrencesBetween(a, asDateTime(key), asDateTime(key)).some(o => o.key === key);
}

/** Drops covers whose key is no longer an occurrence after a timing change; returns the dropped keys. */
export function reconcileCovers(a: Activity): { activity: Activity; dropped: OccurrenceKey[] } {
  const keys = Object.keys(a.overrides);
  const dropped = keys.filter(k => !isOccurrence(a, k));
  if (dropped.length === 0) return { activity: a, dropped };
  const overrides = Object.fromEntries(Object.entries(a.overrides).filter(([k]) => !dropped.includes(k)));
  return { activity: { ...a, overrides }, dropped };
}

function inRange(start: LocalDate | LocalDateTime, from: LocalDateTime, to: LocalDateTime): boolean {
  const s = asDateTime(start);
  return s >= from && s <= to;
}

export function calendarStarts(rrule: string, anchor: LocalDate | LocalDateTime, from: LocalDateTime, to: LocalDateTime): Array<LocalDate | LocalDateTime> {
  const rule = new RRule({ ...RRule.parseString(rrule), dtstart: toFloating(anchor) });
  return rule.between(toFloating(from), toFloating(to), true).map(d => fromFloating(d, isDateOnly(anchor)));
}

function toOccurrence(a: Activity, start: LocalDate | LocalDateTime, done: Set<OccurrenceKey>): Occurrence {
  const seriesAssignee = a.props.assignment?.assignee;
  const override = a.overrides[start];
  const occ: Occurrence = { activityId: a.id, key: start, start };
  const end = endFor(a, start);
  if (end !== undefined) occ.end = end;
  const assignee = override?.assignee ?? seriesAssignee;
  if (assignee !== undefined) occ.assignee = assignee;
  if (override && seriesAssignee !== undefined && override.assignee !== seriesAssignee) occ.coveredFor = seriesAssignee;
  if (done.has(start)) occ.done = true;
  return occ;
}

function endFor(a: Activity, start: LocalDate | LocalDateTime): LocalDateTime | undefined {
  const s = a.props.schedule;
  if (!s?.end) return undefined;
  const duration = toFloating(s.end).getTime() - toFloating(s.start).getTime();
  return fromFloating(new Date(toFloating(start).getTime() + duration), false);
}
