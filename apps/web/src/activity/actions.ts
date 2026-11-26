import { can, hasOccurrences, shapeOf } from '@attivita/core';
import type { AccountId, Activity, Group, Occurrence } from '@attivita/core';

export type ActionKind =
  | 'accept' | 'reject' | 'release' | 'claim' | 'cover' | 'leaveOccurrence' | 'complete' | 'reopenOccurrence' | 'met'
  | 'acceptCover' | 'refuseCover' | 'askCover' | 'withdrawCover'
  | 'skip' | 'moveOccurrence' | 'restore'
  | 'moveToGroup' | 'decompose' | 'snooze' | 'archive' | 'toDraft';

/** What the account may do on this activity right now; the core operations enforce the same rules again. */
export function availableActions(a: Activity, occ: Occurrence | null, group: Group | null, me: AccountId): ActionKind[] {
  if (a.status !== 'open') return [];
  if (a.groupId === null) return a.accountId === me ? ['moveToGroup', 'decompose', 'snooze', 'archive'] : [];
  if (!group) return [];
  const asg = a.props.assignment;
  const mine = (occ?.assignee ?? asg?.assignee) === me;
  const out: ActionKind[] = [];
  if (asg?.state === 'proposed' && asg.assignee === me && can(group, me, 'respondToOwnAssignment')) out.push('accept', 'reject');
  if (asg?.state === 'accepted' && asg.assignee === me && can(group, me, 'respondToOwnAssignment')) out.push('release');
  // In the personal group everything is already the account's own.
  if (!asg && group.kind !== 'personal' && can(group, me, 'claim')) out.push('claim');
  // One occurrence of a calendar series, or of days chosen: the only kinds that are skipped, moved or done on their own.
  const one = hasOccurrences(a) ? occ : null;
  // A skipped occurrence, or the day a moved one left, is no occurrence to do: it can only be put back.
  const off = one !== null && (one.skipped === true || one.movedTo !== undefined);
  // Not in the personal group: every occurrence there is already the account's own.
  if (one && !off && group.kind !== 'personal' && one.assignee !== me && !one.done && can(group, me, 'takeOccurrence')) out.push('cover');
  // The way back from cover (user's bug, 2026-11-17): who covered an occurrence gives it back.
  if (one && !one.done && a.overrides[one.key]?.takenBy === me) out.push('leaveOccurrence');
  // «Copri tu questa» (2026-11-26): the one asked answers; who has the time asks a member, or takes the request back.
  const ask = one && !off && !one.done ? one.asked : undefined;
  if (ask && !ask.refused && ask.to === me) out.push('acceptCover', 'refuseCover');
  const others = Object.entries(group.members).some(([m, r]) => m !== me && r !== 'guest');
  if (one && !off && !one.done && group.kind !== 'personal' && one.assignee === me && (!ask || ask.refused) && others && can(group, me, 'takeOccurrence')) out.push('askCover');
  if (ask && ask.by === me) out.push('withdrawCover');
  const waiting = shapeOf(a, group.id) === 'waiting';
  const completes = can(group, me, 'editActivity') || (mine && can(group, me, 'completeOwn'));
  if (!waiting && !off && !occ?.done && completes) out.push('complete');
  if (one?.done && completes) out.push('reopenOccurrence');
  if (one && can(group, me, 'editActivity')) {
    if (off || one.movedFrom !== undefined) out.push('restore');
    if (!off && !one.done) out.push('skip', 'moveOccurrence');
  }
  if (waiting && can(group, me, 'markConditionMet')) out.push('met');
  // An idea of the personal group goes to a group from a button of its own, as a draft does (before, only the «Dove» value moved it).
  if (group.kind === 'personal' && a.accountId === me) out.push('moveToGroup');
  if (can(group, me, 'editActivity')) out.push('archive');
  // Its author may take it back among the drafts (guests edit nothing in the group).
  if (a.accountId === me && can(group, me, 'editActivity')) out.push('toDraft');
  return out;
}
