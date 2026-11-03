import { expect, test } from 'vitest';
import { removeProp, setProp, shapeOf } from '../src/index.js';
import { base, t1, t2 } from './fixtures.js';

test('testSetPropAddsHistoryAndDoesNotMutate', () => {
  const b = setProp(base, 'due', '2026-11-10', 'u1', t1);
  expect(b.props.due).toBe('2026-11-10');
  expect(base.props.due).toBeUndefined();
  expect(b.history.at(-1)).toEqual({ at: t1, by: 'u1', kind: 'propSet', detail: { key: 'due', value: '2026-11-10' } });
  expect(b.updatedAt).toBe(t1);
  expect(b.version).toBe(base.version);
});

test('testRemovePropRestoresPreviousShape', () => {
  const g = { ...base, groupId: 'g1' };
  const r = removeProp(setProp(g, 'due', '2026-11-10', 'u1', t1), 'due', 'u1', t2);
  expect(shapeOf(r, 'p1')).toBe('idea');
  expect(r.history.at(-1)?.kind).toBe('propRemoved');
});

test('testSetPropRejectsAssignmentAndParentViaGenericSetter', () => {
  expect(() => setProp(base, 'assignment', { state: 'accepted', assignee: 'u2', assignedBy: 'u1' }, 'u1', t1))
    .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(() => setProp(base, 'parentId', 'x', 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

test('testScheduleEndBeforeStartRejected', () => {
  expect(() => setProp(base, 'schedule', { start: '2026-11-10T10:00', end: '2026-11-10T09:00' }, 'u1', t1))
    .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

test('testRepeatCountMustBePositive', () => {
  expect(() => setProp(base, 'repeat', { mode: 'fromCompletion', every: { unit: 'month', count: 0 } }, 'u1', t1))
    .toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});
