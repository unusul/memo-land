import { RRule } from 'rrule';
import { completedKeys, nextDue } from './completion.js';
import { asDateTime, fromFloating, isDateOnly, toFloating } from './dates.js';
import { fail } from './errors.js';
import { touch } from './props.js';
import type {
  AccountId, Activity, ActivityId, CoverAsk, DayTime, HistoryKind, Instant, LocalDate, LocalDateTime, OccurrenceKey, OccurrenceOverride, Role, Weekday,
} from './types.js';

export interface Occurrence {
  activityId: ActivityId;
  key: OccurrenceKey;
  start: LocalDateTime | LocalDate;
  end?: LocalDateTime;
  assignee?: AccountId;
  /** Set when someone else covers this occurrence for the series assignee. */
  coveredFor?: AccountId;
  /** «Copri tu questa» (2026-11-26): the request on this time, waiting or refused. */
  asked?: CoverAsk;
  /** Set when this occurrence of a calendar series has been completed. */
  done?: true;
  /** Set when this occurrence does not take place; it is still listed, struck through. */
  skipped?: true;
  /** On the day an occurrence left: where it went. That row is struck through, the occurrence is the moved one. */
  movedTo?: LocalDateTime | LocalDate;
  /** On the day an occurrence went to: the start it had, which is also its key. */
  movedFrom?: OccurrenceKey;
}

export function anchorOf(a: Activity): LocalDate | LocalDateTime | undefined {
  return a.props.schedule?.start ?? a.props.due;
}

/** Every row the range shows: the series' own starts (skipped and moved away ones too) and the occurrences moved into it. */
export function occurrencesBetween(a: Activity, from: LocalDateTime, to: LocalDateTime): Occurrence[] {
  const anchor = anchorOf(a);
  if (anchor === undefined) return [];
  const done = completedKeys(a);
  const own = startsOf(a, anchor, from, to).filter(s => inRange(s, from, to)).map(s => toOccurrence(a, s, s, done));
  const movedIn = Object.entries(a.overrides).filter(([, o]) => o.moved !== undefined && inRange(o.moved, from, to));
  return [...own, ...movedIn.map(([key, o]) => toOccurrence(a, key, o.moved!, done))].sort((x, y) => asDateTime(x.start).localeCompare(asDateTime(y.start)));
}

/** A series' own starts up to its last day, when it has one. */
function startsOf(a: Activity, anchor: LocalDate | LocalDateTime, from: LocalDateTime, to: LocalDateTime): Array<LocalDate | LocalDateTime> {
  const until = a.props.repeat?.until;
  const all = everyStartOf(a, anchor, from, to);
  return until === undefined ? all : all.filter(s => s.slice(0, 10) <= until);
}

function everyStartOf(a: Activity, anchor: LocalDate | LocalDateTime, from: LocalDateTime, to: LocalDateTime): Array<LocalDate | LocalDateTime> {
  const repeat = a.props.repeat;
  if (repeat?.mode === 'calendar') {
    if (!repeat.times || isDateOnly(anchor)) return calendarStarts(repeat.rrule, anchor, from, to);
    // The rule gives each day at the schedule's time; a day with a time of its own may fall in the range while the
    // schedule's time does not, so whole days are asked and the caller keeps the starts in range.
    const days = calendarStarts(repeat.rrule, anchor, `${from.slice(0, 10)}T00:00`, `${to.slice(0, 10)}T23:59`);
    return days.map(s => atDayTime(s, repeat.times!));
  }
  if (repeat?.mode === 'fromCompletion') return [nextDue(a) ?? anchor];
  if (repeat?.mode === 'dates') return chosenStarts(anchor, repeat.dates);
  return [anchor];
}

/** The anchor and each chosen day at the anchor's time, in order, a day given twice once. */
export function chosenStarts(anchor: LocalDate | LocalDateTime, dates: LocalDate[]): Array<LocalDate | LocalDateTime> {
  const time = isDateOnly(anchor) ? '' : anchor.slice(10);
  const days = [...new Set([anchor.slice(0, 10), ...dates])].sort();
  return days.map(d => (d === anchor.slice(0, 10) ? anchor : `${d}${time}`));
}

/** A series whose times can be changed one by one: by a rule on the calendar, or on days chosen (2026-11-17). */
export const hasOccurrences = (a: Activity): boolean => a.props.repeat?.mode === 'calendar' || a.props.repeat?.mode === 'dates';

const WEEKDAY_OF_DATE: Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const weekdayOf = (start: LocalDate | LocalDateTime): Weekday => WEEKDAY_OF_DATE[toFloating(start).getUTCDay()]!;
type DayTimes = Partial<Record<Weekday, DayTime>>;

function atDayTime(start: LocalDateTime | LocalDate, times: DayTimes): LocalDateTime | LocalDate {
  const own = times[weekdayOf(start)];
  return own ? `${start.slice(0, 10)}T${own.start}` : start;
}

export function takeOccurrence(a: Activity, key: OccurrenceKey, by: AccountId, byRole: Role, now: Instant): Activity {
  if (byRole === 'guest') fail('FORBIDDEN', 'guests cannot take occurrences');
  if (!isOccurrence(a, key)) fail('INVALID_INPUT', `"${key}" is not an occurrence of this activity`);
  // Added to what the time already holds, a move or a skip (2026-11-17): before, it was written anew and a move was lost.
  // Whoever takes it, a request on it goes: the time is no longer the asker's (2026-11-26).
  const { asked: _asked, ...was } = a.overrides[key] ?? {};
  const overrides = { ...a.overrides, [key]: { ...was, assignee: by, takenBy: by } };
  return touch({ ...a, overrides }, { kind: 'occurrenceTaken', detail: { key } }, by, now);
}

/**
 * Gives back an occurrence the account covered (user's bug, 2026-11-17: «Copro io questa» had no way back): it goes to
 * the series' assignee again, or free; a skip or a move made meanwhile stays. Only who covered it gives it back.
 */
export function leaveOccurrence(a: Activity, key: OccurrenceKey, by: AccountId, now: Instant): Activity {
  const current = a.overrides[key];
  if (!current?.takenBy) fail('INVALID_STATE', 'nobody covered this occurrence');
  if (current.takenBy !== by) fail('FORBIDDEN', 'only who covered the occurrence gives it back');
  // A request the coverer made goes with the time it gives back (2026-11-26).
  const { assignee: _a, takenBy: _t, asked: _q, ...rest } = current;
  const { [key]: _gone, ...others } = a.overrides;
  const overrides = Object.keys(rest).length > 0 ? { ...others, [key]: rest } : others;
  return touch({ ...a, overrides }, { kind: 'occurrenceLeft', detail: { key } }, by, now);
}

/** The occurrence does not take place this time; the rest of the series is untouched. */
export function skipOccurrence(a: Activity, key: OccurrenceKey, by: AccountId, byRole: Role, now: Instant): Activity {
  return changeOccurrence(a, key, by, byRole, now, ({ moved: _gone, ...o }) => ({ ...o, skipped: true }), { kind: 'occurrenceSkipped', detail: { key } });
}

/** Moves one occurrence to another start, of the same kind as its key (a day and a time, or a day); it keeps its duration. */
export function moveOccurrence(a: Activity, key: OccurrenceKey, to: LocalDateTime | LocalDate, by: AccountId, byRole: Role, now: Instant): Activity {
  if (isDateOnly(to) !== isDateOnly(key)) fail('INVALID_INPUT', `"${to}" and "${key}" are not both days or both times`);
  const change = ({ skipped: _s, moved: _m, ...o }: OccurrenceOverride): OccurrenceOverride => (to === key ? o : { ...o, moved: to });
  return changeOccurrence(a, key, by, byRole, now, change, { kind: 'occurrenceMoved', detail: { key, to } });
}

/** Undoes a skip or a move: the occurrence is back on its own start. */
export function restoreOccurrence(a: Activity, key: OccurrenceKey, by: AccountId, byRole: Role, now: Instant): Activity {
  return changeOccurrence(a, key, by, byRole, now, ({ skipped: _s, moved: _m, ...o }) => o, { kind: 'occurrenceRestored', detail: { key } });
}

function changeOccurrence(
  a: Activity, key: OccurrenceKey, by: AccountId, byRole: Role, now: Instant,
  change: (o: OccurrenceOverride) => OccurrenceOverride, entry: { kind: HistoryKind; detail: Record<string, unknown> },
): Activity {
  if (byRole === 'guest') fail('FORBIDDEN', 'guests cannot change occurrences');
  if (!hasOccurrences(a)) fail('INVALID_STATE', 'only a calendar series has occurrences to change');
  if (!isOccurrence(a, key)) fail('INVALID_INPUT', `"${key}" is not an occurrence of this activity`);
  const { [key]: current, ...others } = a.overrides;
  const next = change(current ?? {});
  const overrides = Object.keys(next).length === 0 ? others : { ...others, [key]: next };
  return touch({ ...a, overrides }, entry, by, now);
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

/** The row for `key` at `start`: its own start, or the one it was moved to. */
function toOccurrence(a: Activity, key: OccurrenceKey, start: LocalDate | LocalDateTime, done: Set<OccurrenceKey>): Occurrence {
  const seriesAssignee = a.props.assignment?.assignee;
  const override = a.overrides[key];
  const occ: Occurrence = { activityId: a.id, key, start };
  const end = start === key ? endFor(a, key) : shifted(endFor(a, key), key, start);
  if (end !== undefined) occ.end = end;
  const assignee = override?.assignee ?? seriesAssignee;
  if (assignee !== undefined) occ.assignee = assignee;
  if (override?.assignee !== undefined && seriesAssignee !== undefined && override.assignee !== seriesAssignee) occ.coveredFor = seriesAssignee;
  if (override?.skipped) occ.skipped = true;
  if (override?.asked) occ.asked = override.asked;
  const movedAway = override?.moved !== undefined && start === key;
  if (movedAway) occ.movedTo = override.moved;
  if (override?.moved !== undefined && start !== key) occ.movedFrom = key;
  if (done.has(key) && !movedAway) occ.done = true;
  return occ;
}

function shifted(end: LocalDateTime | undefined, from: LocalDate | LocalDateTime, to: LocalDate | LocalDateTime): LocalDateTime | undefined {
  if (end === undefined || isDateOnly(to)) return undefined;
  return fromFloating(new Date(toFloating(end).getTime() - toFloating(from).getTime() + toFloating(to).getTime()), false);
}

function endFor(a: Activity, start: LocalDate | LocalDateTime): LocalDateTime | undefined {
  const repeat = a.props.repeat;
  const ownEnd = repeat?.mode === 'calendar' ? repeat.times?.[weekdayOf(start)]?.end : undefined;
  if (ownEnd && !isDateOnly(start)) return `${start.slice(0, 10)}T${ownEnd}`;
  const s = a.props.schedule;
  if (!s?.end) return undefined;
  const duration = toFloating(s.end).getTime() - toFloating(s.start).getTime();
  return fromFloating(new Date(toFloating(start).getTime() + duration), false);
}
