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
    return touch({ ...resetForNextRound(a), lastCompletedAt: doneOn }, { kind: 'completed', detail: { doneOn } }, by, now);
  }
  if (key !== undefined && !isOccurrence(a, key)) fail('INVALID_INPUT', `"${key}" is not an occurrence of this activity`);
  const target = key ?? currentPendingOccurrence(a, doneOn);
  if (target === undefined) fail('INVALID_STATE', 'no pending occurrence to complete');
  return touch(resetForNextRound(a), { kind: 'completed', detail: { key: target, doneOn } }, by, now);
}

/** Next due date of a fromCompletion recurrence: last completion + interval, or the anchor if never completed. */
export function nextDue(a: Activity): LocalDate | LocalDateTime | undefined {
  const repeat = a.props.repeat;
  if (repeat?.mode !== 'fromCompletion' || a.lastCompletedAt === undefined) return anchorOf(a);
  return addUnits(a.lastCompletedAt, repeat.every.unit, repeat.every.count);
}

export function completedKeys(a: Activity): Set<OccurrenceKey> {
  return new Set(a.history.filter(h => h.kind === 'completed' && typeof h.detail?.['key'] === 'string').map(h => h.detail?.['key'] as string));
}

function currentPendingOccurrence(a: Activity, doneOn: LocalDate | LocalDateTime): OccurrenceKey | undefined {
  const anchor = anchorOf(a);
  if (anchor === undefined) return undefined;
  return occurrencesBetween(a, asDateTime(anchor), endOfDay(doneOn)).filter(o => !o.done).at(-1)?.key;
}
