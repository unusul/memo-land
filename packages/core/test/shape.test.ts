import { expect, test } from 'vitest';
import { newActivity, shapeOf } from '../src/index.js';
import { base, now } from './fixtures.js';

test('testNewActivityIsDraftVersion1', () => {
  expect(shapeOf(base, 'p1')).toBe('draft');
  expect(base.version).toBe(1);
  expect(base.history).toEqual([{ at: now, by: 'u1', kind: 'created' }]);
});

test('testShapePrecedence', () => {
  const g = { ...base, groupId: 'g1' };
  expect(shapeOf(g, 'p1')).toBe('idea');
  expect(shapeOf({ ...g, props: { due: '2026-11-10' } }, 'p1')).toBe('task');
  expect(shapeOf({ ...g, props: { due: '2026-11-10', repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY' } } }, 'p1')).toBe('recurring');
  expect(shapeOf({ ...g, props: { repeat: { mode: 'calendar', rrule: 'FREQ=DAILY' }, waitingFor: { condition: 'ops 412 closed' } } }, 'p1')).toBe('waiting');
  expect(shapeOf({ ...g, props: { waitingFor: { condition: 'x', metAt: now, metBy: 'u2' } } }, 'p1')).toBe('idea');
  expect(shapeOf({ ...g, status: 'archived', props: { due: '2026-11-10' } }, 'p1')).toBe('archived');
});

test('testNewActivityDefaults', () => {
  const a = newActivity({ id: 'x', accountId: 'u9', title: 'memo' }, now);
  expect(a).toMatchObject({ groupId: null, body: '', attachments: [], props: {}, status: 'open', overrides: {}, createdAt: now, updatedAt: now });
});
