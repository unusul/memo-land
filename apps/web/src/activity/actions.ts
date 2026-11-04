import { can, shapeOf } from '@attivita/core';
import type { AccountId, Activity, Group, Occurrence } from '@attivita/core';

export type ActionKind =
  | 'accept' | 'reject' | 'claim' | 'cover' | 'complete' | 'met'
  | 'moveToGroup' | 'keepAsIdea' | 'decompose' | 'snooze' | 'archive';

/** What the account may do on this activity right now; the core operations enforce the same rules again. */
export function availableActions(a: Activity, occ: Occurrence | null, group: Group | null, me: AccountId): ActionKind[] {
  if (a.status !== 'open') return [];
  if (a.groupId === null) return a.accountId === me ? ['moveToGroup', 'keepAsIdea', 'decompose', 'snooze', 'archive'] : [];
  if (!group) return [];
  const asg = a.props.assignment;
  const mine = (occ?.assignee ?? asg?.assignee) === me;
  const out: ActionKind[] = [];
  if (asg?.state === 'proposed' && asg.assignee === me && can(group, me, 'respondToOwnAssignment')) out.push('accept', 'reject');
  if (!asg && can(group, me, 'claim')) out.push('claim');
  if (occ && a.props.repeat?.mode === 'calendar' && occ.assignee !== me && !occ.done && can(group, me, 'takeOccurrence')) out.push('cover');
  const waiting = shapeOf(a, group.id) === 'waiting';
  if (!waiting && !occ?.done && (can(group, me, 'editActivity') || (mine && can(group, me, 'completeOwn')))) out.push('complete');
  if (waiting && can(group, me, 'markConditionMet')) out.push('met');
  if (can(group, me, 'editActivity')) out.push('archive');
  return out;
}
