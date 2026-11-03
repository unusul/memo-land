import { expect, test } from 'vitest';
import { complete, nextDue, occurrencesBetween } from '../src/index.js';
import { monthly, series, t1, task } from './fixtures.js';

test('testLateCompletionRestartsFromDoneDate', () => {
  const c = complete(monthly, 'u1', '2026-11-10', t1);
  expect(c.status).toBe('open');
  expect(c.lastCompletedAt).toBe('2026-11-10');
  expect(nextDue(c)).toBe('2026-12-10');
});

test('testNeverCompletedUsesDue', () => {
  expect(nextDue(monthly)).toBe('2026-11-01');
});

test('testMonthEndClamps', () => {
  expect(nextDue(complete(monthly, 'u1', '2027-01-31', t1))).toBe('2027-02-28');
  expect(nextDue(complete(monthly, 'u1', '2028-01-31', t1))).toBe('2028-02-29');
});

test('testNonRecurringCompleteIsDone', () => {
  const c = complete(task, 'u1', '2026-11-04', t1);
  expect(c.status).toBe('done');
  expect(c.history.at(-1)).toMatchObject({ kind: 'completed', by: 'u1' });
});

test('testFromCompletionShowsOnlyNextOccurrence', () => {
  const c = complete(monthly, 'u1', '2026-11-10', t1);
  expect(occurrencesBetween(c, '2026-11-01T00:00', '2027-03-01T00:00').map(o => o.start)).toEqual(['2026-12-10']);
});

test('testCalendarCompletionMarksFirstPendingOccurrence', () => {
  const c1 = complete(series, 'pippo', '2026-10-21T10:00', t1);
  expect(c1.status).toBe('open');
  expect(c1.history.at(-1)).toMatchObject({ kind: 'completed', detail: { key: '2026-10-20T09:00' } });
  const c2 = complete(c1, 'pippo', '2026-10-23T08:00', t1);
  expect(c2.history.at(-1)).toMatchObject({ kind: 'completed', detail: { key: '2026-10-22T09:00' } });
});

test('testCalendarCompletionWithNothingPendingFails', () => {
  expect(() => complete(series, 'pippo', '2026-10-19T08:00', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});
