import { can, shapeOf } from '@attivita/core';
import type { AccountId, Activity, Group, Occurrence } from '@attivita/core';

export type ActionKind =
  | 'accept' | 'reject' | 'release' | 'claim' | 'cover' | 'complete' | 'met'
  | 'moveToGroup' | 'keepAsIdea' | 'decompose' | 'snooze' | 'archive' | 'toDraft';

/** What the account may do on this activity right now; the core operations enforce the same rules again. */
export function availableActions(a: Activity, occ: Occurrence | null, group: Group | null, me: AccountId): ActionKind[] {
  if (a.status !== 'open') return [];
  if (a.groupId === null) return a.accountId === me ? ['moveToGroup', 'keepAsIdea', 'decompose', 'snooze', 'archive'] : [];
  if (!group) return [];
  const asg = a.props.assignment;
  const mine = (occ?.assignee ?? asg?.assignee) === me;
  const out: ActionKind[] = [];
  if (asg?.state === 'proposed' && asg.assignee === me && can(group, me, 'respondToOwnAssignment')) out.push('accept', 'reject');
  if (asg?.state === 'accepted' && asg.assignee === me && can(group, me, 'respondToOwnAssignment')) out.push('release');
  // In the personal group everything is already the account's own.
  if (!asg && group.kind !== 'personal' && can(group, me, 'claim')) out.push('claim');
  // Not in the personal group: every occurrence there is already the account's own.
  if (occ && group.kind !== 'personal' && a.props.repeat?.mode === 'calendar' && occ.assignee !== me && !occ.done && can(group, me, 'takeOccurrence')) out.push('cover');
  const waiting = shapeOf(a, group.id) === 'waiting';
  if (!waiting && !occ?.done && (can(group, me, 'editActivity') || (mine && can(group, me, 'completeOwn')))) out.push('complete');
  if (waiting && can(group, me, 'markConditionMet')) out.push('met');
  // An idea of the personal group goes to a group from a button of its own, as a draft does (before, only the «Dove» value moved it).
  if (group.kind === 'personal' && a.accountId === me) out.push('moveToGroup');
  if (can(group, me, 'editActivity')) out.push('archive');
  // Its author may take it back among the drafts (guests edit nothing in the group).
  if (a.accountId === me && can(group, me, 'editActivity')) out.push('toDraft');
  return out;
}
