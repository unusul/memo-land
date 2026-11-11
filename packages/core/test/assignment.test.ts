import { expect, test } from 'vitest';
import { accept, assign, claim, reject, release } from '../src/index.js';
import { t1, t2, task } from './fixtures.js';

test('testRejectReturnsActivityToGroupWithReason', () => {
  const p = assign(task, 'u2', 'u1', 'member', t1);
  const r = reject(p, 'u2', 'no time this week', t2);
  expect(r.props.assignment).toBeUndefined();
  expect(r.history.at(-1)).toMatchObject({ kind: 'rejected', by: 'u2', detail: { reason: 'no time this week', assignedBy: 'u1' } });
});

test('testRejectWithBlankReasonFails', () => {
  const p = assign(task, 'u2', 'u1', 'member', t1);
  expect(() => reject(p, 'u2', '   ', t2)).toThrow(expect.objectContaining({ code: 'REASON_REQUIRED' }));
});

test('testOnlyAssigneeCanAccept', () => {
  const p = assign(task, 'u2', 'u1', 'member', t1);
  expect(() => accept(p, 'u3', t2)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(accept(p, 'u2', t2).props.assignment?.state).toBe('accepted');
});

test('testAcceptTwiceIsInvalidState', () => {
  const a = accept(assign(task, 'u2', 'u1', 'member', t1), 'u2', t2);
  expect(() => accept(a, 'u2', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});

test('testGuestCannotAssignOrClaim', () => {
  expect(() => assign(task, 'u2', 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => claim(task, 'g9', 'guest', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

test('testSelfAssignmentIsAccepted', () => {
  expect(assign(task, 'u1', 'u1', 'member', t1).props.assignment?.state).toBe('accepted');
});

test('testClaimFreeActivity', () => {
  expect(claim(task, 'u3', 'member', t1).props.assignment).toEqual({ state: 'accepted', assignee: 'u3', assignedBy: 'u3' });
  const taken = claim(task, 'u3', 'member', t1);
  expect(() => claim(taken, 'u4', 'member', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});

/** Whoever has it in hand gives it back: free in the group again, a reason only if they want to leave one. */
test('testReleaseReturnsItFreeWithAnOptionalReason', () => {
  const taken = claim(task, 'u2', 'member', t1);
  const free = release(taken, 'u2', t2);
  expect(free.props.assignment).toBeUndefined();
  expect(free.history.at(-1)).toMatchObject({ kind: 'released', by: 'u2', detail: { assignedBy: 'u2' } });
  expect(release(taken, 'u2', t2, ' troppo lavoro ').history.at(-1)?.detail).toEqual({ assignedBy: 'u2', reason: 'troppo lavoro' });
});

/** Only its assignee releases it, and only once accepted: a proposal is answered with accept or reject. */
test('testReleaseOnlyByTheAssigneeOfAnAcceptedAssignment', () => {
  expect(() => release(claim(task, 'u2', 'member', t1), 'u3', t2)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => release(assign(task, 'u2', 'u1', 'owner', t1), 'u2', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
  expect(() => release(task, 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_STATE' }));
});
