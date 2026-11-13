import { fail } from './errors.js';
import { newActivity } from './shape.js';
import { touch, validateProps, withProps } from './props.js';
import type { AccountId, Activity, ActivityId, GroupId, Instant, LocalDate, LocalDateTime, Props, Role } from './types.js';

export const SYSTEM_ACTOR: AccountId = 'system';

export function moveToGroup(a: Activity, groupId: GroupId, by: AccountId, now: Instant): Activity {
  if (a.groupId !== null) fail('INVALID_STATE', 'only drafts can be moved to a group');
  return touch({ ...a, groupId }, { kind: 'movedToGroup', detail: { groupId } }, by, now);
}

/**
 * Its author moves an activity to another group. What belonged to the old group goes: the assignment and the
 * occurrences covered by its members.
 */
export function moveBetweenGroups(a: Activity, groupId: GroupId, by: AccountId, now: Instant): Activity {
  if (a.groupId === null) fail('INVALID_STATE', 'a draft is moved with moveToGroup');
  if (a.groupId === groupId) fail('INVALID_STATE', 'the activity is already in that group');
  if (a.accountId !== by) fail('FORBIDDEN', 'only the author moves it to another group');
  const { assignment: _gone, ...props } = a.props;
  return touch(withProps({ ...a, groupId, overrides: {} }, props), { kind: 'movedToGroup', detail: { groupId, from: a.groupId } }, by, now);
}

/**
 * The way back from a group to the drafts, for the activity's author only. The assignment goes: a draft is only its
 * author's. The account does not change (spec §8), only the group.
 */
export function backToDraft(a: Activity, by: AccountId, now: Instant): Activity {
  if (a.groupId === null) fail('INVALID_STATE', 'the activity is already a draft');
  if (a.accountId !== by) fail('FORBIDDEN', 'only the author can take it back among the drafts');
  const { assignment: _gone, ...props } = a.props;
  return touch(withProps({ ...a, groupId: null }, props), { kind: 'movedToDrafts', detail: { groupId: a.groupId } }, by, now);
}

export function keepAsIdea(a: Activity, personalGroupId: GroupId, by: AccountId, now: Instant): Activity {
  return moveToGroup(a, personalGroupId, by, now);
}

export function archive(a: Activity, by: AccountId, now: Instant): Activity {
  return touch({ ...a, status: 'archived' }, { kind: 'archived' }, by, now);
}

/** Brings an archived or done activity back among the open ones. */
export function reopen(a: Activity, by: AccountId, now: Instant): Activity {
  if (a.status === 'open') fail('INVALID_STATE', 'the activity is already open');
  return touch({ ...a, status: 'open' }, { kind: 'reopened' }, by, now);
}

/**
 * Annulla after a quick action (a swipe): the activity as it was before, history included, as if the action never
 * happened. It takes the version now stored, so it is saved as the next change and refused if someone changed it meanwhile.
 */
export function undoTo(previous: Activity, current: Activity, now: Instant): Activity {
  return { ...previous, version: current.version, updatedAt: now };
}

export function snooze(a: Activity, until: LocalDate | LocalDateTime, by: AccountId, now: Instant): Activity {
  return touch(withProps(a, { ...a.props, resumeAt: until }), { kind: 'snoozed', detail: { until } }, by, now);
}

/** Returns the same reference when the activity is not due to come back yet. */
export function resumeIfDue(a: Activity, today: LocalDateTime, now: Instant): Activity {
  const at = a.props.resumeAt;
  if (at === undefined || at > today) return a;
  const { resumeAt: _gone, ...rest } = a.props;
  return touch(withProps(a, rest), { kind: 'resumed' }, SYSTEM_ACTOR, now);
}

export interface ChildSpec {
  id: ActivityId;
  title: string;
  groupId: GroupId;
  props?: Props;
}

export function decompose(parent: Activity, children: ChildSpec[], by: AccountId, now: Instant): { parent: Activity; children: Activity[] } {
  children.forEach(c => validateProps(c.props ?? {}));
  const created = children.map(c => withProps(
    newActivity({ id: c.id, accountId: parent.accountId, title: c.title, groupId: c.groupId }, now),
    { ...c.props, parentId: parent.id },
  ));
  const updated = touch(parent, { kind: 'decomposed', detail: { children: children.map(c => c.id) } }, by, now);
  return { parent: updated, children: created };
}

export function markConditionMet(a: Activity, by: AccountId, byRole: Role, now: Instant): Activity {
  if (byRole === 'guest') fail('FORBIDDEN', 'guests cannot unblock memos');
  const w = a.props.waitingFor;
  if (!w || w.metAt) fail('INVALID_STATE', 'activity is not waiting');
  return touch(withProps(a, { ...a.props, waitingFor: { ...w, metAt: now, metBy: by } }), { kind: 'conditionMet' }, by, now);
}
