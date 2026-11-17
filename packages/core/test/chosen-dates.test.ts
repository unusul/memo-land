import { expect, test } from 'vitest';
import { complete, needsAttention, occurrencesBetween, setProp, skipOccurrence } from '../src/index.js';
import type { Activity } from '../src/index.js';
import { inviteGroup, t1, t2, task } from './fixtures.js';

/*
 * «A date scelte» (user's choices, 2026-11-17): a third way of Ripeti, days chosen one by one besides the day of the
 * date or schedule, each at its time, in place of a rule. Each day is a time of the same activity: done, skipped, moved
 * or covered on its own; the last one done closes it. Before, another day meant another activity.
 */

/** Andare a Roma: 20 November 08:00–20:00, then 4 and 18 December. */
const rome: Activity = {
  ...task, id: 'rome', groupId: 'inv1', props: {
    schedule: { start: '2026-11-20T08:00', end: '2026-11-20T20:00' },
    repeat: { mode: 'dates', dates: ['2026-12-18', '2026-12-04'] },
  },
};

test('testChosenDaysAreTimesAtTheScheduleTime', () => {
  const times = occurrencesBetween(rome, '2026-11-01T00:00', '2026-12-31T23:59');
  expect(times.map(o => [o.start, o.end])).toEqual([
    ['2026-11-20T08:00', '2026-11-20T20:00'], ['2026-12-04T08:00', '2026-12-04T20:00'], ['2026-12-18T08:00', '2026-12-18T20:00'],
  ]);
});

/** A due date without a time: each day chosen is a due date of that day. */
test('testChosenDaysOnADueDateAreWholeDays', () => {
  const bins: Activity = { ...task, props: { due: '2026-11-17', repeat: { mode: 'dates', dates: ['2026-12-04'] } } };
  expect(occurrencesBetween(bins, '2026-11-01T00:00', '2026-12-31T23:59').map(o => o.start)).toEqual(['2026-11-17', '2026-12-04']);
});

/** Done counts for one day only; the last day done closes the activity. */
test('testDoneIsOneDayAndTheLastClosesIt', () => {
  const first = complete(rome, 'u1', '2026-11-20T21:00', t1, '2026-11-20T08:00');
  expect(first.status).toBe('open');
  expect(occurrencesBetween(first, '2026-11-01T00:00', '2026-12-31T23:59').map(o => o.done === true)).toEqual([true, false, false]);
  const second = complete(first, 'u1', '2026-12-04T21:00', t1, '2026-12-04T08:00');
  expect(complete(second, 'u1', '2026-12-18T21:00', t2, '2026-12-18T08:00').status).toBe('done');
});

/** A day is skipped on its own, as a time of a series by the calendar. */
test('testAChosenDayIsSkippedOnItsOwn', () => {
  const s = skipOccurrence(rome, '2026-12-04T08:00', 'u1', 'owner', t1);
  expect(occurrencesBetween(s, '2026-11-01T00:00', '2026-12-31T23:59').map(o => o.skipped === true)).toEqual([false, true, false]);
});

/** On a due date, the first day gone by and not done is overdue, as a single due date; done, the next one counts. */
test('testAMissedChosenDueDayIsOverdue', () => {
  const bins: Activity = { ...task, groupId: 'inv1', props: { due: '2026-11-17', repeat: { mode: 'dates', dates: ['2026-11-24'] } } };
  const at = (a: Activity, day: string) => needsAttention([{ group: inviteGroup, activities: [a] }], 'u1', day).overdue.map(o => o.since);
  expect(at(bins, '2026-11-17')).toEqual([]);
  expect(at(bins, '2026-11-18')).toEqual(['2026-11-17']);
  const done = complete(bins, 'u1', '2026-11-18', t1, '2026-11-17');
  expect(at(done, '2026-11-20')).toEqual([]);
  expect(at(done, '2026-11-25')).toEqual(['2026-11-24']);
});

/** Only dates are days that can be chosen. */
test('testChosenDaysMustBeDates', () => {
  expect(() => setProp(task, 'repeat', { mode: 'dates', dates: ['4 dicembre'] }, 'u1', t1)).toThrow();
  expect(setProp(task, 'repeat', { mode: 'dates', dates: ['2026-12-04'] }, 'u1', t1).props.repeat).toEqual({ mode: 'dates', dates: ['2026-12-04'] });
});
