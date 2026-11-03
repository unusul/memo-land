import { fail } from './errors.js';
import { newActivity } from './shape.js';
import { touch, validateProps, withProps } from './props.js';
import type { AccountId, Activity, ActivityId, GroupId, Instant, LocalDate, LocalDateTime, Props, Role } from './types.js';

export const SYSTEM_ACTOR: AccountId = 'system';

export function moveToGroup(a: Activity, groupId: GroupId, by: AccountId, now: Instant): Activity {
  if (a.groupId !== null) fail('INVALID_STATE', 'only drafts can be moved to a group');
  return touch({ ...a, groupId }, { kind: 'movedToGroup', detail: { groupId } }, by, now);
}

export function keepAsIdea(a: Activity, personalGroupId: GroupId, by: AccountId, now: Instant): Activity {
  return moveToGroup(a, personalGroupId, by, now);
}

export function archive(a: Activity, by: AccountId, now: Instant): Activity {
  return touch({ ...a, status: 'archived' }, { kind: 'archived' }, by, now);
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
