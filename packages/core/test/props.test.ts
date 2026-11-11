import { expect, test } from 'vitest';
import { editText, removeProp, setProp, shapeOf } from '../src/index.js';
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

/**
 * Removing the only date of a repeating activity used to be accepted: the series kept its rule with no start, produced
 * no occurrences and vanished from the agenda. The rule needs a start, so the date goes only after the repeat.
 */
test('testRepeatingActivityKeepsADateToStartFrom', () => {
  const series = setProp(setProp(base, 'due', '2026-11-10', 'u1', t1), 'repeat', { mode: 'calendar', rrule: 'FREQ=WEEKLY' }, 'u1', t1);
  expect(() => removeProp(series, 'due', 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  const withEvent = setProp(series, 'schedule', { start: '2026-11-10T09:00' }, 'u1', t2);
  expect(removeProp(withEvent, 'due', 'u1', t2).props.schedule).toEqual({ start: '2026-11-10T09:00' });
  expect(removeProp(removeProp(series, 'repeat', 'u1', t2), 'due', 'u1', t2).props).toEqual({});
});

test('testRepeatNeedsADateToStartFrom', () => {
  expect(() => setProp(base, 'repeat', { mode: 'calendar', rrule: 'FREQ=WEEKLY' }, 'u1', t1))
    .toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});

test('testEditTextRecordsWhatChanged', () => {
  const r = editText(base, { title: '  app memo-land  ', body: base.body }, 'u1', t1);
  expect(r.title).toBe('app memo-land');
  expect(r.history.at(-1)).toEqual({ at: t1, by: 'u1', kind: 'textEdited', detail: { fields: ['title'] } });
  expect(editText(r, { title: 'app memo-land' }, 'u1', t2)).toBe(r);
  expect(() => editText(base, { title: '   ' }, 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(editText(base, { body: 'dettagli' }, 'u1', t1).history.at(-1)?.detail).toEqual({ fields: ['body'] });
});
