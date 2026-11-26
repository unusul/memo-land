import { fromFloating, newActivity, setProp, toFloating } from '@attivita/core';
import type { AccountId, Activity, Instant, LocalDate, LocalDateTime } from '@attivita/core';
import { localNow, newId } from '../dates.js';
import { daysOf } from './RepeatHere.js';

/** What «Copia su un altro giorno» did: the day added to the same activity, a new activity, or nothing (already there). */
export type CopyResult = { kind: 'added' | 'created'; activity: Activity } | { kind: 'there' };

/**
 * «Copia su un altro giorno», from a row of a day in the Calendar (user's choices, 2026-11-17). Without a rule, or with
 * days chosen already, the day joins the same activity's days («seleziona date»): one activity, one history, each day
 * its own state. A series by a rule cannot take a day more, so a new activity is born on that day, on its own. So does
 * a done activity (user's bug, 2026-11-26): the day added to it would be born done; before, a done one could not be
 * copied at all.
 */
export function copyToDay(a: Activity, day: LocalDate, by: AccountId, now: Instant): CopyResult {
  const repeat = a.props.repeat;
  if (repeat !== undefined && repeat.mode !== 'dates') return { kind: 'created', activity: copyOf(a, day, by, now) };
  if (daysOf(a).includes(day)) return { kind: 'there' };
  if (a.status !== 'open') return { kind: 'created', activity: copyOf(a, day, by, now) };
  const dates = repeat?.mode === 'dates' ? repeat.dates : [];
  return { kind: 'added', activity: setProp(a, 'repeat', { mode: 'dates', dates: [...dates, day].sort() }, by, now) };
}

/**
 * The copy of a series by a rule (user's choices, 2026-11-17): title, text, group, its time and length on the day chosen,
 * priority, Informazione utile, Non mostrare in calendario, Si chiude da sola, the list with every item still to do. It
 * is born free: no assignee; and without the rule, the history and the files (they would have to be copied).
 */
function copyOf(a: Activity, day: LocalDate, by: AccountId, now: Instant): Activity {
  const fresh = newActivity({ id: newId(), accountId: by, title: a.title, body: a.body, groupId: a.groupId }, now);
  const { schedule, due, priority } = a.props;
  const when = schedule
    ? { schedule: { start: onDay(schedule.start, day), ...(schedule.end ? { end: shiftedEnd(schedule.start, schedule.end, day) } : {}) } }
    : due !== undefined ? { due: due.length > 10 ? onDay(due, day) : day } : {};
  return {
    ...fresh,
    props: { ...when, ...(priority ? { priority } : {}) },
    ...(a.info ? { info: true } : {}),
    ...(a.offCalendar ? { offCalendar: true } : {}),
    ...(a.closesItself ? { closesItself: { since: localNow() } } : {}),
    ...(a.checklist ? { checklist: { ...a.checklist, items: a.checklist.items.map(({ assignee: _who, ...item }) => ({ ...item, done: false })) } } : {}),
  };
}

/** The same time on another day. */
const onDay = (at: string, day: LocalDate): LocalDateTime => `${day}${at.slice(10)}`;

/** The end as far from the new start as it was from the old one. */
function shiftedEnd(start: LocalDateTime, end: LocalDateTime, day: LocalDate): LocalDateTime {
  const length = toFloating(end).getTime() - toFloating(start).getTime();
  return fromFloating(new Date(toFloating(onDay(start, day)).getTime() + length), false);
}
