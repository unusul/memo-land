import { expect, test } from 'vitest';
import { archive, backToDraft, complete, decompose, moveBetweenGroups, keepAsIdea, markConditionMet, moveToGroup, resumeIfDue, setProp, shapeOf, reopen, snooze, undoTo } from '../src/index.js';
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

/** Reopening brings an archived or done activity back among the open ones, and says so in the history. */
test('testReopenArchivedAndDone', () => {
  const back = reopen(archive(task, 'u1', t1), 'u2', t2);
  expect(back.status).toBe('open');
  expect(back.history.at(-1)).toMatchObject({ kind: 'reopened', by: 'u2', at: t2 });
  expect(shapeOf(back, 'p1')).toBe('task');
  expect(reopen(complete(task, 'u1', '2026-11-03', t1), 'u1', t2).status).toBe('open');
});

test('testReopenAnOpenActivityFails', () => {
  expect(() => reopen(task, 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});

/** Back among the drafts: the group goes, and so does the assignment, since a draft is only its author's. */
test('testBackToDraftDropsGroupAndAssignment', () => {
  const assigned = { ...task, props: { ...task.props, assignment: { state: 'proposed' as const, assignee: 'u2', assignedBy: 'u1' } } };
  const d = backToDraft(assigned, 'u1', t1);
  expect(d.groupId).toBeNull();
  expect(d.accountId).toBe('u1');
  expect(d.props).toEqual({ due: '2026-11-10' });
  expect(d.history.at(-1)).toMatchObject({ kind: 'movedToDrafts', by: 'u1', detail: { groupId: 'g1' } });
  expect(shapeOf(d, 'p1')).toBe('draft');
});

test('testBackToDraftOnlyByItsAuthorAndFromAGroup', () => {
  expect(() => backToDraft(task, 'u2', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => backToDraft(draft, 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});

/** Its author moves an activity from one group to another; assignment and occurrence takeovers stay with the old group. */
test('testMoveBetweenGroupsDropsWhatBelongedToTheOldGroup', () => {
  const busy = { ...task, props: { ...task.props, assignment: { state: 'accepted' as const, assignee: 'u2', assignedBy: 'u1' } },
    overrides: { '2026-11-05T09:00': { assignee: 'u3', takenBy: 'u3' } } };
  const moved = moveBetweenGroups(busy, 'g2', 'u1', t1);
  expect(moved.groupId).toBe('g2');
  expect(moved.props).toEqual({ due: '2026-11-10' });
  expect(moved.overrides).toEqual({});
  expect(moved.history.at(-1)).toMatchObject({ kind: 'movedToGroup', detail: { groupId: 'g2', from: 'g1' } });
});

test('testMoveBetweenGroupsOnlyByItsAuthorAndToAnotherGroup', () => {
  expect(() => moveBetweenGroups(task, 'g2', 'u2', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => moveBetweenGroups(task, 'g1', 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  expect(() => moveBetweenGroups(draft, 'g1', 'u1', t1)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});

/**
 * Annulla after a swipe puts back what the activity was, history included, as if the action never happened; it keeps
 * the stored version, so the engines accept it as the next change and refuse it if someone changed the activity meanwhile.
 */
test('testUndoToPutsBackThePreviousContent', () => {
  const done = complete(task, 'u1', '2026-11-03', t1);
  const stored = { ...done, version: task.version + 1 };
  const back = undoTo(task, stored, t2);
  expect(back.status).toBe('open');
  expect(back.history).toEqual(task.history);
  expect(back.version).toBe(stored.version);
  expect(back.updatedAt).toBe(t2);
  expect(shapeOf(back, 'p1')).toBe(shapeOf(task, 'p1'));
});
