import { expect, test } from 'vitest';
import { occurrencesBetween, takeOccurrence } from '../src/index.js';
import type { Activity } from '../src/index.js';
import { series, t1, task } from './fixtures.js';

test('testWeeklyTwiceStaysAt0900AcrossDst', () => {
  const occ = occurrencesBetween(series, '2026-10-20T00:00', '2026-11-01T00:00');
  expect(occ.map(o => o.start)).toEqual(['2026-10-20T09:00', '2026-10-22T09:00', '2026-10-27T09:00', '2026-10-29T09:00']);
  expect(occ[0]?.end).toBe('2026-10-20T09:30');
});

test('testPlutoCoversOneWeekSeriesStaysPippo', () => {
  let s = takeOccurrence(series, '2026-10-27T09:00', 'pluto', 'member', t1);
  s = takeOccurrence(s, '2026-10-29T09:00', 'pluto', 'member', t1);
  const occ = occurrencesBetween(s, '2026-10-20T00:00', '2026-11-06T00:00');
  expect(occ.map(o => [o.start.slice(5, 10), o.assignee, o.coveredFor])).toEqual([
    ['10-20', 'pippo', undefined], ['10-22', 'pippo', undefined],
    ['10-27', 'pluto', 'pippo'], ['10-29', 'pluto', 'pippo'],
    ['11-03', 'pippo', undefined], ['11-05', 'pippo', undefined]]);
  expect(s.props.assignment?.assignee).toBe('pippo');
  expect(s.history.at(-1)).toMatchObject({ kind: 'occurrenceTaken', by: 'pluto', detail: { key: '2026-10-29T09:00' } });
});

test('testTakeOccurrenceRejectsNonOccurrenceAndGuests', () => {
  expect(() => takeOccurrence(series, '2026-10-21T09:00', 'pluto', 'member', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(() => takeOccurrence(series, '2026-10-22T09:00', 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

test('testTwiceAMonthOn1stAnd15th', () => {
  const m: Activity = { ...task, props: { due: '2026-11-01', repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' } } };
  expect(occurrencesBetween(m, '2026-11-01T00:00', '2026-12-31T23:59').map(o => o.start))
    .toEqual(['2026-11-01', '2026-11-15', '2026-12-01', '2026-12-15']);
});

test('testNonRecurringHasAtMostOneOccurrence', () => {
  expect(occurrencesBetween(task, '2026-11-01T00:00', '2026-11-30T23:59').map(o => o.start)).toEqual(['2026-11-10']);
  expect(occurrencesBetween(task, '2026-12-01T00:00', '2026-12-31T23:59')).toEqual([]);
  expect(occurrencesBetween({ ...task, props: {} }, '2026-11-01T00:00', '2026-11-30T23:59')).toEqual([]);
});
