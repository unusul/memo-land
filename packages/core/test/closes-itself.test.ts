import { expect, test } from 'vitest';
import { closeByItself, completedKeys, setClosesItself, skipOccurrence } from '../src/index.js';
import type { Activity } from '../src/index.js';
import { base, series, t1, t2 } from './fixtures.js';

/*
 * «Si chiude da sola» (user's choices, 2026-11-16): an activity with a date and time, switched on, is marked done by
 * itself at the end of its time (at its start without an end); a series one time after the other, going on. Only the
 * times after the switch was turned on: a series switched on late does not fill its history. Whoever opens the app
 * after that time does it; the history says it closed by itself, at that time.
 */

const sunset: Activity = { ...base, id: 'sun', groupId: 'g1', title: 'Tramonto', props: { schedule: { start: '2026-11-21T17:00' } } };
/** Tuesdays and Thursdays 09:00–09:30, from 20 October. */
const work = series;

test('testSwitchOnAndOff', () => {
  const on = setClosesItself(sunset, true, '2026-11-20T10:00', 'u1', t1);
  expect(on.closesItself).toEqual({ since: '2026-11-20T10:00' });
  expect(on.updatedAt).toBe(t1);
  expect(setClosesItself(on, false, '2026-11-20T11:00', 'u1', t2).closesItself).toBeUndefined();
});

/** A single one closes at its start when it has no end, and not before. */
test('testASingleOneClosesAtItsTime', () => {
  const on = setClosesItself(sunset, true, '2026-11-20T10:00', 'u1', t1);
  expect(closeByItself(on, '2026-11-21T16:59', 'u1', t2)).toBe(on);
  const closed = closeByItself(on, '2026-11-21T18:30', 'u1', t2);
  expect(closed.status).toBe('done');
  expect(closed.history.at(-1)).toMatchObject({ kind: 'completed', by: 'u1', detail: { doneOn: '2026-11-21T17:00', auto: true, closedAt: '2026-11-21T17:00' } });
});

/** With an end it closes at the end: «Riunione 10–11» at 11. */
test('testWithAnEndItClosesAtTheEnd', () => {
  const meeting = setClosesItself({ ...sunset, props: { schedule: { start: '2026-11-21T10:00', end: '2026-11-21T11:00' } } }, true, '2026-11-20T10:00', 'u1', t1);
  expect(closeByItself(meeting, '2026-11-21T10:30', 'u1', t2)).toBe(meeting);
  expect(closeByItself(meeting, '2026-11-21T11:00', 'u1', t2).status).toBe('done');
});

/** Off, nothing happens. */
test('testOffNothingCloses', () => {
  expect(closeByItself(sunset, '2026-12-01T00:00', 'u1', t2)).toBe(sunset);
});

/** A series: each time after the switch closes by itself at its end, and the series goes on. */
test('testASeriesClosesEachTimeAndGoesOn', () => {
  const on = setClosesItself(work, true, '2026-11-03T09:10', 'u1', t1);
  const next = closeByItself(on, '2026-11-06T08:00', 'u1', t2);
  expect([...completedKeys(next)]).toEqual(['2026-11-03T09:00', '2026-11-05T09:00']);
  expect(next.status).toBe('open');
  expect(closeByItself(next, '2026-11-06T08:00', 'u1', t2)).toBe(next);
});

/** A skipped time is not marked done. */
test('testASkippedTimeStaysSkipped', () => {
  const on = skipOccurrence(setClosesItself(work, true, '2026-11-02T00:00', 'u1', t1), '2026-11-05T09:00', 'u1', 'member', t1);
  expect([...completedKeys(closeByItself(on, '2026-11-06T08:00', 'u1', t2))]).toEqual(['2026-11-03T09:00']);
});

/** With a last day, the last time closing by itself closes the activity too. */
test('testASeriesWithAnEndClosesAtTheLastTime', () => {
  const ending: Activity = { ...work, props: { ...work.props, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', until: '2026-11-05' } } };
  const closed = closeByItself(setClosesItself(ending, true, '2026-11-02T00:00', 'u1', t1), '2026-11-10T00:00', 'u1', t2);
  expect(closed.status).toBe('done');
});

/** «Da quando la completi»: each time counts from the last one done, so they close one after the other. */
test('testFromCompletionClosesOneAfterTheOther', () => {
  const daily: Activity = { ...sunset, props: { schedule: { start: '2026-11-20T08:00', end: '2026-11-20T09:00' }, repeat: { mode: 'fromCompletion', every: { unit: 'day', count: 1 } } } };
  const closed = closeByItself(setClosesItself(daily, true, '2026-11-20T07:00', 'u1', t1), '2026-11-22T10:00', 'u1', t2);
  expect(closed.history.filter(h => h.kind === 'completed').map(h => h.detail?.['closedAt'])).toEqual(['2026-11-20T09:00', '2026-11-21T09:00', '2026-11-22T09:00']);
  expect(closed.status).toBe('open');
});
