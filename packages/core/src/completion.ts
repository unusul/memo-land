import { resetForNextRound } from './checklist.js';
import { addUnits, asDateTime, endOfDay } from './dates.js';
import { fail } from './errors.js';
import { anchorOf, isOccurrence, occurrencesBetween } from './occurrences.js';
import { touch } from './props.js';
import type { AccountId, Activity, Instant, LocalDate, LocalDateTime, OccurrenceKey } from './types.js';

/**
 * Completes an activity. For a calendar series the completed occurrence is `key` when given,
 * otherwise the latest pending occurrence up to the end of doneOn's day.
 */
export function complete(a: Activity, by: AccountId, doneOn: LocalDate | LocalDateTime, now: Instant, key?: OccurrenceKey): Activity {
  const repeat = a.props.repeat;
  if (!repeat) return touch({ ...a, status: 'done' }, { kind: 'completed', detail: { doneOn } }, by, now);
  if (repeat.mode === 'fromCompletion') {
    // The next time would fall after the series' last day: this was the last one, and it closes the activity.
    const last = repeat.until !== undefined && addUnits(doneOn, repeat.every.unit, repeat.every.count).slice(0, 10) > repeat.until;
    return touch({ ...resetForNextRound(a), lastCompletedAt: doneOn, ...(last ? { status: 'done' as const } : {}) }, { kind: 'completed', detail: { doneOn } }, by, now);
  }
  if (key !== undefined && !isOccurrence(a, key)) fail('INVALID_INPUT', `"${key}" is not an occurrence of this activity`);
  const target = key ?? currentPendingOccurrence(a, doneOn);
  if (target === undefined) fail('INVALID_STATE', 'no pending occurrence to complete');
  const closes = repeat.until !== undefined && isLastOccurrence(a, target, repeat.until);
  return touch({ ...resetForNextRound(a), ...(closes ? { status: 'done' as const } : {}) }, { kind: 'completed', detail: { key: target, doneOn } }, by, now);
}

/** No time of the series after `key` up to its last day, a skipped one aside: `key` is the last one. */
function isLastOccurrence(a: Activity, key: OccurrenceKey, until: LocalDate): boolean {
  return !occurrencesBetween(a, asDateTime(key), `${until}T23:59`).some(o => o.key !== key && asDateTime(o.start) > asDateTime(key) && !o.skipped);
}

/** Next due date of a fromCompletion recurrence: last completion + interval, or the anchor if never completed. */
export function nextDue(a: Activity): LocalDate | LocalDateTime | undefined {
  const repeat = a.props.repeat;
  if (repeat?.mode !== 'fromCompletion' || a.lastCompletedAt === undefined) return anchorOf(a);
  return addUnits(a.lastCompletedAt, repeat.every.unit, repeat.every.count);
}

/** Occurrences done, in history order: a reopen takes one back, a later completion makes it done again. */
export function completedKeys(a: Activity): Set<OccurrenceKey> {
  const keys = new Set<OccurrenceKey>();
  for (const h of a.history) {
    const key = h.detail?.['key'];
    if (typeof key !== 'string') continue;
    if (h.kind === 'completed') keys.add(key);
    else if (h.kind === 'occurrenceReopened') keys.delete(key);
  }
  return keys;
}

/** Takes back «done» from one occurrence of a calendar series. */
export function reopenOccurrence(a: Activity, key: OccurrenceKey, by: AccountId, now: Instant): Activity {
  if (!completedKeys(a).has(key)) fail('INVALID_STATE', `occurrence "${key}" is not done`);
  return touch(a, { kind: 'occurrenceReopened', detail: { key } }, by, now);
}

/** The latest occurrence still to do: not done, not skipped, and not the day a moved one left. */
function currentPendingOccurrence(a: Activity, doneOn: LocalDate | LocalDateTime): OccurrenceKey | undefined {
  const anchor = anchorOf(a);
  if (anchor === undefined) return undefined;
  const open = occurrencesBetween(a, asDateTime(anchor), endOfDay(doneOn)).filter(o => !o.done && !o.skipped && o.movedTo === undefined);
  return open.at(-1)?.key;
}
