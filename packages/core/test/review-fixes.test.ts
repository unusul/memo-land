import { expect, test } from 'vitest';
import {
  addMember, buildAgenda, complete, decompose, joinDomainGroup, leaveGroup, occurrencesBetween, setProp, takeOccurrence,
} from '../src/index.js';
import type { Activity } from '../src/index.js';
import { domainGroup, draft, inviteGroup, series, t1, t2, task } from './fixtures.js';

/** Before the fix addMember overwrote an existing member's role, so a member could demote the owner. */
test('testAddMemberCannotChangeExistingRole', () => {
  expect(() => addMember(inviteGroup, 'u1', 'guest', 'u3')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

/** Before the fix the oldest pending occurrence was completed, even a year old. */
test('testCalendarCompletionPicksCurrentOccurrence', () => {
  const old: Activity = { ...series, props: { ...series.props, schedule: { start: '2025-10-21T09:00' } } };
  const c = complete(old, 'pippo', '2026-11-03T10:00', t1);
  expect(c.history.at(-1)).toMatchObject({ kind: 'completed', detail: { key: '2026-11-03T09:00' } });
});

/** Before the fix a date-only doneOn, or an early completion, on the occurrence day threw INVALID_STATE. */
test('testCalendarCompletionSameDay', () => {
  expect(complete(series, 'pippo', '2026-10-20', t1).history.at(-1)).toMatchObject({ detail: { key: '2026-10-20T09:00' } });
  expect(complete(series, 'pippo', '2026-10-20T08:30', t1).history.at(-1)).toMatchObject({ detail: { key: '2026-10-20T09:00' } });
});

test('testExplicitOccurrenceKeyCompletion', () => {
  expect(complete(series, 'pippo', '2026-10-30', t1, '2026-10-27T09:00').history.at(-1)).toMatchObject({ detail: { key: '2026-10-27T09:00' } });
  expect(() => complete(series, 'pippo', '2026-10-30', t1, '2026-10-28T09:00')).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

/** Before the fix completed occurrences looked identical to pending ones. */
test('testCompletedOccurrenceIsMarkedDone', () => {
  const c = complete(series, 'pippo', '2026-10-20', t1);
  const occ = occurrencesBetween(c, '2026-10-20T00:00', '2026-10-22T23:59');
  expect(occ.map(o => o.done)).toEqual([true, undefined]);
  const agenda = buildAgenda([{ group: domainGroup, activities: [c] }], '2026-10-20T00:00', '2026-10-20T23:59');
  expect(agenda.days['2026-10-20']?.[0]?.done).toBe(true);
});

/** Before the fix moving a series silently lost covers keyed by the old start. */
test('testChangingSeriesTimeRecordsDroppedCovers', () => {
  const covered = takeOccurrence(series, '2026-11-05T09:00', 'pluto', 'member', t1);
  const moved = setProp(covered, 'schedule', { start: '2026-10-20T10:00' }, 'u1', t2);
  expect(moved.overrides).toEqual({});
  expect(moved.history.at(-1)).toMatchObject({ kind: 'propSet', detail: { droppedCovers: ['2026-11-05T09:00'] } });
  const kept = setProp(covered, 'schedule', { start: '2026-10-20T09:00', end: '2026-10-20T10:00' }, 'u1', t2);
  expect(Object.keys(kept.overrides)).toEqual(['2026-11-05T09:00']);
});

/** Before the fix bad rules and dates were stored and later crashed or vanished from the agenda. */
test('testInvalidRulesAndDatesRejected', () => {
  const bad = (k: 'repeat' | 'due', v: never) => () => setProp(task, k, v, 'u1', t1);
  expect(bad('repeat', { mode: 'calendar', rrule: 'FREQ=BOGUS' } as never)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(bad('due', '2026-11-1' as never)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(bad('due', '10/11/2026' as never)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(bad('due', '2026-02-30' as never)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

/** Before the fix decompose stored child props without any of the setter's guards. */
test('testDecomposeValidatesChildProps', () => {
  const child = (props: object) => () => decompose(draft, [{ id: 'c', title: 'x', groupId: 'g1', props: props as never }], 'u1', t1);
  expect(child({ assignment: { state: 'accepted', assignee: 'u2', assignedBy: 'u1' } })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(child({ schedule: { start: '2026-11-10T10:00', end: '2026-11-10T09:00' } })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(child({ repeat: { mode: 'fromCompletion', every: { unit: 'day', count: 0 } } })).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

/** Before the fix the owner could leave and the group became undeletable. */
test('testOwnerCannotLeaveInviteGroup', () => {
  expect(() => leaveGroup(inviteGroup, 'u1', [], 'bye', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

/** Before the fix anyone could self-join any domain group. */
test('testDomainGroupJoinRequiresMatchingEmail', () => {
  expect(() => joinDomainGroup(domainGroup, 'mallory', 'mallory@gmail.com')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(joinDomainGroup(domainGroup, 'paperino', 'Paperino@Altereos.com').members['paperino']).toBe('member');
  expect(() => addMember(domainGroup, 'paperino', 'member', 'paperino')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});
