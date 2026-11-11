import { expect, test } from 'vitest';
import { addMember, can, domainGroupNameFor, groupTypeOf, listActivityId, joinDomainGroup, leaveGroup, removeMember, roleIn, takeOccurrence } from '../src/index.js';
import { domainGroup, inviteGroup, personalGroup, seriesForPippo, t1, t2, unrelated } from './fixtures.js';

test('testPublicDomainHasNoDomainGroup', () => {
  expect(domainGroupNameFor('Pluto@Gmail.com')).toBeNull();
  expect(domainGroupNameFor('pippo@Altereos.com')).toBe('altereos.com');
});

test('testDomainGroupNobodyRemovesNobody', () => {
  expect(can(domainGroup, 'pippo', 'removeMember')).toBe(false);
  expect(can(domainGroup, 'pippo', 'deleteGroup')).toBe(false);
  expect(can(domainGroup, 'pippo', 'invite')).toBe(false);
  expect(() => addMember(domainGroup, 'ext', 'guest', 'pippo')).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(joinDomainGroup(domainGroup, 'newbie', 'newbie@altereos.com').members['newbie']).toBe('member');
  expect(() => removeMember(domainGroup, 'pluto', 'pippo', [], 'x', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

test('testInviteGuestCanOnlyRespondAndComplete', () => {
  expect(can(inviteGroup, 'guest1', 'assign')).toBe(false);
  expect(can(inviteGroup, 'guest1', 'invite')).toBe(false);
  expect(can(inviteGroup, 'guest1', 'respondToOwnAssignment')).toBe(true);
  expect(can(inviteGroup, 'guest1', 'completeOwn')).toBe(true);
  expect(can(inviteGroup, 'u3', 'invite')).toBe(true);
  expect(can(inviteGroup, 'u3', 'deleteGroup')).toBe(false);
  expect(can(inviteGroup, 'u1', 'deleteGroup')).toBe(true);
  expect(can(inviteGroup, 'stranger', 'comment')).toBe(false);
  expect(roleIn(inviteGroup, 'guest1')).toBe('guest');
});

test('testPersonalGroupCannotBeLeftOrDeleted', () => {
  expect(can(personalGroup, 'u1', 'deleteGroup')).toBe(false);
  expect(() => leaveGroup(personalGroup, 'u1', [], 'x', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

test('testLeaveUnassignsSeriesAndDropsOverrides', () => {
  const s = takeOccurrence(seriesForPippo, '2026-10-27T09:00', 'pluto', 'member', t1);
  const { group, changed } = leaveGroup(domainGroup, 'pluto', [s, unrelated], 'left the company', t2);
  expect(group.members['pluto']).toBeUndefined();
  expect(changed).toHaveLength(1);
  expect(changed[0]?.overrides).toEqual({});
  expect(changed[0]?.props.assignment?.assignee).toBe('pippo');
  const l = leaveGroup(domainGroup, 'pippo', [seriesForPippo], 'left the company', t2);
  expect(l.changed[0]?.props.assignment).toBeUndefined();
  expect(l.changed[0]?.history.at(-1)).toMatchObject({ kind: 'unassignedOnLeave', detail: { reason: 'left the company' } });
});

test('testInviteMemberCanRemoveGuestButGuestCannotRemove', () => {
  const r = removeMember(inviteGroup, 'guest1', 'u3', [], 'not needed', t1);
  expect(r.group.members['guest1']).toBeUndefined();
  expect(() => removeMember(inviteGroup, 'u3', 'guest1', [], 'x', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
  expect(() => removeMember(inviteGroup, 'u1', 'u3', [], 'x', t1)).toThrow(expect.objectContaining({ code: 'FORBIDDEN' }));
});

/** A group with no type is a group of activities, as every group made before types existed. */
test('testGroupTypeDefaultsToActivities', () => {
  expect(groupTypeOf(inviteGroup)).toBe('activities');
  expect(groupTypeOf({ ...inviteGroup, type: 'list' })).toBe('list');
  expect(listActivityId(inviteGroup)).toBe(`${inviteGroup.id}#list`);
});
