import { expect, test } from 'vitest';
import { archive, decompose, keepAsIdea, markConditionMet, moveToGroup, resumeIfDue, setProp, shapeOf, snooze } from '../src/index.js';
import { draft, movedIdea, t1, t2, task } from './fixtures.js';

test('testDecomposeLinksChildrenToParent', () => {
  const { parent, children } = decompose(draft, [
    { id: 'c1', title: 'kickoff meeting', groupId: 'g1', props: { schedule: { start: '2026-11-05T10:00' } } },
    { id: 'c2', title: 'progress review', groupId: 'g1', props: { repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' } } },
    { id: 'c3', title: 'cost analysis', groupId: 'g1', props: { due: '2026-11-20' } },
  ], 'u1', t1);
  expect(children.map(c => c.props.parentId)).toEqual(['a1', 'a1', 'a1']);
  expect(children.map(c => c.accountId)).toEqual(['u1', 'u1', 'u1']);
  expect(children.map(c => shapeOf(c, 'p1'))).toEqual(['event', 'recurring', 'task']);
  expect(parent.history.at(-1)).toMatchObject({ kind: 'decomposed', detail: { children: ['c1', 'c2', 'c3'] } });
});

test('testSnoozeThenResume', () => {
  const s = snooze(movedIdea, '2026-12-03', 'u1', t1);
  expect(shapeOf(s, 'p1')).toBe('snoozed');
  expect(resumeIfDue(s, '2026-12-02T23:59', t2)).toBe(s);
  const r = resumeIfDue(s, '2026-12-03T00:00', t2);
  expect(shapeOf(r, 'p1')).toBe('idea');
  expect(r.history.at(-1)).toMatchObject({ kind: 'resumed', by: 'system' });
});

test('testAnyMemberUnblocksWaitingMemo', () => {
  const w = setProp(task, 'waitingFor', { condition: 'ops 412 closed' }, 'u1', t1);
  expect(shapeOf(w, 'p1')).toBe('waiting');
  const m = markConditionMet(w, 'u3', 'member', t2);
  expect(shapeOf(m, 'p1')).toBe('task');
  expect(m.props.waitingFor).toMatchObject({ metAt: t2, metBy: 'u3' });
  expect(() => markConditionMet(m, 'u2', 'member', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  expect(() => markConditionMet(w, 'g9', 'guest', t2)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

test('testMoveToGroupOnlyFromDraft', () => {
  expect(() => moveToGroup(task, 'g2', 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  expect(moveToGroup(draft, 'g2', 'u1', t1).groupId).toBe('g2');
  expect(keepAsIdea(draft, 'p1', 'u1', t1).groupId).toBe('p1');
});

test('testArchive', () => {
  expect(shapeOf(archive(task, 'u1', t1), 'p1')).toBe('archived');
});
