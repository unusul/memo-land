import { complete, nextDue } from './completion.js';
import { asDateTime } from './dates.js';
import { anchorOf, occurrencesBetween } from './occurrences.js';
import type { AccountId, Activity, Instant, LocalDate, LocalDateTime } from './types.js';

/*
 * «Si chiude da sola» (user's choices, 2026-11-16): an activity with a date and time that is only to know about («Anna
 * al lavoro 8–17:30», «Tramonto alle 17») is marked done by itself at the end of its time, at its start without an end;
 * a series one time after the other, going on. Only the times ending after the switch was turned on count. There is no
 * server: whoever opens the app after that time does it, and the history says it closed by itself, at that time.
 */

export function setClosesItself(a: Activity, on: boolean, since: LocalDateTime, _by: AccountId, now: Instant): Activity {
  const { closesItself: _old, ...rest } = a;
  return { ...(on ? { ...rest, closesItself: { since } } : rest), updatedAt: now };
}

/** At most this many times are closed in one go: a phone back after months does not freeze on a daily series. */
const MAX_AT_ONCE = 400;

/** The activity with every time ended by `nowLocal` (and after the switch) marked done; the same one when nothing ends. */
export function closeByItself(a: Activity, nowLocal: LocalDateTime, by: AccountId, now: Instant): Activity {
  const since = a.closesItself?.since;
  if (since === undefined || a.status !== 'open' || !a.props.schedule) return a;
  if (a.props.repeat?.mode === 'fromCompletion') return closeFromCompletion(a, since, nowLocal, by, now);
  if (!a.props.repeat) {
    const end = endOf(a.props.schedule.start, a.props.schedule.end);
    return end > since && end <= nowLocal ? markAuto(complete(a, by, end, now), end) : a;
  }
  const due = occurrencesBetween(a, since.slice(0, 10) + 'T00:00', nowLocal)
    .filter(o => !o.done && !o.skipped && o.movedTo === undefined)
    .map(o => ({ key: o.key, end: endOf(o.start, o.end) }))
    .filter(o => o.end > since && o.end <= nowLocal)
    .slice(0, MAX_AT_ONCE);
  let next = a;
  for (const o of due) if (next.status === 'open') next = markAuto(complete(next, by, o.end, now, o.key), o.end);
  return next;
}

/** «Da quando la completi»: the next time is counted from the last one done, so they close one after the other. */
function closeFromCompletion(a: Activity, since: LocalDateTime, nowLocal: LocalDateTime, by: AccountId, now: Instant): Activity {
  let next = a;
  for (let i = 0; i < MAX_AT_ONCE && next.status === 'open'; i++) {
    const start = nextDue(next) ?? anchorOf(next);
    if (start === undefined) break;
    const end = endOf(start, shiftedEnd(a, start));
    if (end > nowLocal) break;
    // A time that ended before the switch was turned on stays the person's to mark: the next ones follow from it.
    if (end <= since) break;
    // Done «on» its start, so the next time keeps the cadence; closed at its end, as the history says.
    next = markAuto(complete(next, by, asDateTime(start), now), end);
  }
  return next;
}

/** The schedule's duration carried to another start. */
function shiftedEnd(a: Activity, start: LocalDate | LocalDateTime): LocalDateTime | undefined {
  const s = a.props.schedule;
  if (!s?.end) return undefined;
  const length = Date.parse(`${s.end}:00Z`) - Date.parse(`${s.start}:00Z`);
  return new Date(Date.parse(`${asDateTime(start)}:00Z`) + length).toISOString().slice(0, 16);
}

const endOf = (start: LocalDate | LocalDateTime, end?: LocalDate | LocalDateTime): LocalDateTime => asDateTime(end ?? start);

/** The completion just written is the app's, not a person's choice: the history says so, with the time it closed at. */
function markAuto(a: Activity, closedAt: LocalDateTime): Activity {
  const last = a.history.at(-1);
  if (last?.kind !== 'completed') return a;
  return { ...a, history: [...a.history.slice(0, -1), { ...last, detail: { ...last.detail, auto: true, closedAt } }] };
}
