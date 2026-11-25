import { expect, test } from 'vitest';
import { addCounter, buildAgenda, bump, complete, counterStats, countOn, removeCounter, resetDay } from '../src/index.js';
import type { Activity } from '../src/index.js';
import { base, costTask, inviteGroup, t1, t2 } from './fixtures.js';

const counted: Activity = { ...costTask, id: 'water', title: "Bicchieri d'acqua", counter: { days: {} } };

/** + adds one to the day, − takes one away but never below 0; a day back to 0 is not kept. */
test('testTheCounterGoesUpAndDown', () => {
  let a = addCounter(base, t1);
  expect(a.counter).toEqual({ days: {} });
  expect(addCounter(a, t2)).toBe(a);
  a = bump(bump(a, '2026-11-25', 1, t2), '2026-11-25', 1, t2);
  expect(countOn(a, '2026-11-25')).toBe(2);
  expect(a.updatedAt).toBe(t2);
  a = bump(bump(bump(a, '2026-11-25', -1, t2), '2026-11-25', -1, t2), '2026-11-25', -1, t2);
  expect(countOn(a, '2026-11-25')).toBe(0);
  expect(a.counter!.days).toEqual({});
  expect(() => bump(base, '2026-11-25', 1, t2)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
  expect(removeCounter(a, t2).counter).toBeUndefined();
});

/**
 * «Azzera» (user's choice, 2026-11-25) brings today back to 0 and keeps the days before, which the statistics compare.
 * The other way, a reset that wiped the history, was set aside.
 */
test('testResettingKeepsTheDaysBefore', () => {
  const a = { ...counted, counter: { days: { '2026-11-24': 5, '2026-11-25': 3 } } };
  expect(resetDay(a, '2026-11-25', t2).counter!.days).toEqual({ '2026-11-24': 5 });
});

/** 7 days, 8 weeks from Monday, 6 months; the average counts from the first bar with a count. */
test('testTheCounterStatistics', () => {
  const a = { ...counted, counter: { days: { '2026-11-23': 4, '2026-11-24': 6, '2026-11-25': 2, '2026-11-16': 10, '2026-10-02': 7 } } };
  const day = counterStats(a, 'day', '2026-11-25');
  expect(day.bars.map(b => b.from)).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']);
  expect(day.bars.map(b => b.total)).toEqual([0, 0, 0, 0, 4, 6, 2]);
  expect(day).toMatchObject({ current: 2, average: 4 });
  const week = counterStats(a, 'week', '2026-11-25');
  expect(week.bars).toHaveLength(8);
  expect(week.bars.at(-1)).toEqual({ from: '2026-11-23', total: 12 });
  expect(week.bars.at(-2)).toEqual({ from: '2026-11-16', total: 10 });
  const month = counterStats(a, 'month', '2026-11-25');
  expect(month.bars.map(b => b.from)).toEqual(['2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01', '2026-10-01', '2026-11-01']);
  expect(month).toMatchObject({ current: 22, average: 14.5 });
  expect(counterStats(base, 'day', '2026-11-25').average).toBe(0);
});

/**
 * In the Agenda an open activity with a counter is one row on today, whatever its dates (user's choice, 2026-11-25: no
 * repeat to set); done, it goes. Without `today` the Agenda stays as before.
 */
test('testACounterIsOnTodayInTheAgenda', () => {
  const agenda = (a: Activity) => buildAgenda([{ group: inviteGroup, activities: [a] }], '2026-11-20T00:00', '2026-12-03T23:59', '2026-11-25').days;
  expect(Object.keys(agenda(counted))).toEqual(['2026-11-25']);
  expect(agenda(counted)['2026-11-25']![0]).toMatchObject({ activityId: 'water', start: '2026-11-25' });
  expect(agenda(complete(counted, 'u1', '2026-11-25', t1))).toEqual({});
  expect(buildAgenda([{ group: inviteGroup, activities: [counted] }], '2026-11-26T00:00', '2026-12-03T23:59', '2026-11-25').days).toEqual({});
});
