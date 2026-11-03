import { fail } from './errors.js';
import { touch, withProps } from './props.js';
import { DEFAULT_PUBLIC_DOMAINS } from './public-domains.js';
import type { AccountId, Activity, GroupId, Instant, Role } from './types.js';

export type GroupKind = 'personal' | 'domain' | 'invite';

export interface Group {
  id: GroupId;
  kind: GroupKind;
  name: string;
  domain?: string;
  /** Absent for domain groups: nobody owns them. */
  ownerId?: AccountId;
  timeZone: string;
  members: Record<AccountId, Role>;
  version: number;
}

export type Action =
  | 'deleteGroup' | 'transferOwnership' | 'invite' | 'removeMember'
  | 'editActivity' | 'assign' | 'claim' | 'takeOccurrence' | 'markConditionMet'
  | 'comment' | 'respondToOwnAssignment' | 'completeOwn';

const OWNER_ONLY: ReadonlySet<Action> = new Set<Action>(['deleteGroup', 'transferOwnership']);
const MANAGE: ReadonlySet<Action> = new Set<Action>(['invite', 'removeMember']);
const EVERYONE: ReadonlySet<Action> = new Set<Action>(['comment', 'respondToOwnAssignment', 'completeOwn']);

export function roleIn(group: Group, actor: AccountId): Role | undefined {
  return group.members[actor];
}

export function can(group: Group, actor: AccountId, action: Action): boolean {
  const role = roleIn(group, actor);
  if (role === undefined) return false;
  if (EVERYONE.has(action)) return true;
  if (role === 'guest') return false;
  if (OWNER_ONLY.has(action)) return group.kind === 'invite' && role === 'owner';
  if (MANAGE.has(action)) return group.kind === 'invite';
  return true;
}

export function domainOf(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1).trim().toLowerCase();
}

export function domainGroupNameFor(email: string, publicDomains: readonly string[] = DEFAULT_PUBLIC_DOMAINS): string | null {
  const domain = domainOf(email);
  return publicDomains.includes(domain) ? null : domain;
}

/** Invites a new member to an invite group; existing members' roles never change here. */
export function addMember(group: Group, account: AccountId, role: Role, by: AccountId): Group {
  if (group.kind !== 'invite') fail('FORBIDDEN', 'only invite groups accept invitations');
  if (account in group.members) fail('FORBIDDEN', 'already a member');
  if (!can(group, by, 'invite') || role === 'owner') fail('FORBIDDEN', 'not allowed to invite');
  return { ...group, members: { ...group.members, [account]: role } };
}

/** Self-join of a domain group, allowed only with an email of that domain. */
export function joinDomainGroup(group: Group, account: AccountId, email: string): Group {
  if (group.kind !== 'domain' || domainOf(email) !== group.domain) fail('FORBIDDEN', 'email does not belong to this domain');
  if (account in group.members) return group;
  return { ...group, members: { ...group.members, [account]: 'member' } };
}

export interface MembershipChange {
  group: Group;
  changed: Activity[];
}

export function leaveGroup(group: Group, account: AccountId, activities: Activity[], reason: string, now: Instant): MembershipChange {
  if (group.kind === 'personal') fail('FORBIDDEN', 'the personal group cannot be left');
  if (account === group.ownerId) fail('FORBIDDEN', 'the owner must transfer ownership before leaving');
  return dropMember(group, account, activities, reason, account, now);
}

export function removeMember(group: Group, target: AccountId, by: AccountId, activities: Activity[], reason: string, now: Instant): MembershipChange {
  if (!can(group, by, 'removeMember') || target === group.ownerId) fail('FORBIDDEN', 'not allowed to remove this member');
  return dropMember(group, target, activities, reason, by, now);
}

function dropMember(group: Group, account: AccountId, activities: Activity[], reason: string, by: AccountId, now: Instant): MembershipChange {
  const { [account]: _gone, ...members } = group.members;
  const changed = activities.map(a => releaseFrom(a, account, reason, by, now)).filter((a, i) => a !== activities[i]);
  return { group: { ...group, members }, changed };
}

/** Removes the account's assignment and covers; returns the same reference when nothing changes. */
function releaseFrom(a: Activity, account: AccountId, reason: string, by: AccountId, now: Instant): Activity {
  const assigned = a.props.assignment?.assignee === account;
  const keptOverrides = Object.fromEntries(Object.entries(a.overrides).filter(([, o]) => o.assignee !== account));
  const coversDropped = Object.keys(keptOverrides).length !== Object.keys(a.overrides).length;
  if (!assigned && !coversDropped) return a;
  const { assignment: _old, ...rest } = a.props;
  const released = withProps({ ...a, overrides: keptOverrides }, assigned ? rest : a.props);
  return touch(released, { kind: 'unassignedOnLeave', detail: { reason, account } }, by, now);
}
