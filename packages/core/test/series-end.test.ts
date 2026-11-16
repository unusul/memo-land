import { expect, test } from 'vitest';
import { complete, nextDue, occurrencesBetween, skipOccurrence } from '../src/index.js';
import type { Activity } from '../src/index.js';
import { monthly, series, t1 } from './fixtures.js';

/*
 * The end of a series (user's choices, 2026-11-16): only a date, «fino al 14 dic»; the series has no time after it, and
 * the last time done closes the activity, as a one-off does. Before, a series went on for ever.
 */

/** Tuesdays and Thursdays at 09:00 until Thursday 5 November. */
const ending: Activity = { ...series, props: { ...series.props, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', until: '2026-11-05' } } };
const starts = (a: Activity) => occurrencesBetween(a, '2026-10-27T00:00', '2026-11-30T23:59').map(o => o.start);

test('testNoOccurrenceAfterTheEnd', () => {
  expect(starts(ending)).toEqual(['2026-10-27T09:00', '2026-10-29T09:00', '2026-11-03T09:00', '2026-11-05T09:00']);
});

/** Without an end the series goes on, as before. */
test('testWithoutAnEndTheSeriesGoesOn', () => {
  expect(starts(series)).toHaveLength(10);
});

/** The last time done closes the activity; an earlier one does not. */
test('testTheLastTimeDoneClosesTheSeries', () => {
  const earlier = complete(ending, 'u1', '2026-11-03', t1, '2026-11-03T09:00');
  expect(earlier.status).toBe('open');
  const last = complete(earlier, 'u1', '2026-11-05', t1, '2026-11-05T09:00');
  expect(last.status).toBe('done');
  expect(last.history.at(-1)).toMatchObject({ kind: 'completed', detail: { key: '2026-11-05T09:00' } });
});

/** A last time skipped does not count: the one before it is then the last one. */
test('testASkippedLastTimeLeavesTheOneBeforeAsTheLast', () => {
  const skipped = skipOccurrence(ending, '2026-11-05T09:00', 'u1', 'member', t1);
  expect(complete(skipped, 'u1', '2026-11-03', t1, '2026-11-03T09:00').status).toBe('done');
});

/** «Da quando la completi»: a completion whose next time would fall after the end closes the activity. */
test('testFromCompletionClosesWhenTheNextTimeFallsAfterTheEnd', () => {
  const m: Activity = { ...monthly, props: { ...monthly.props, repeat: { mode: 'fromCompletion', every: { unit: 'month', count: 1 }, until: '2026-12-20' } } };
  const first = complete(m, 'u1', '2026-11-10', t1);
  expect(first.status).toBe('open');
  expect(nextDue(first)).toBe('2026-12-10');
  expect(complete(first, 'u1', '2026-12-10', t1).status).toBe('done');
});
