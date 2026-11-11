import { fail } from './errors.js';
import { touch, withProps } from './props.js';
import type { AccountId, Activity, Assignment, Instant, Role } from './types.js';

function requireNotGuest(role: Role, what: string): void {
  if (role === 'guest') fail('FORBIDDEN', `guests cannot ${what}`);
}

function withAssignment(a: Activity, assignment: Assignment | undefined): Activity {
  const { assignment: _old, ...rest } = a.props;
  return withProps(a, assignment ? { ...rest, assignment } : rest);
}

export function assign(a: Activity, assignee: AccountId, by: AccountId, byRole: Role, now: Instant): Activity {
  requireNotGuest(byRole, 'assign');
  const state = assignee === by ? 'accepted' : 'proposed';
  return touch(withAssignment(a, { state, assignee, assignedBy: by }), { kind: 'assigned', detail: { assignee, state } }, by, now);
}

export function accept(a: Activity, by: AccountId, now: Instant): Activity {
  const current = a.props.assignment;
  if (!current || current.assignee !== by) fail('FORBIDDEN', 'only the proposed assignee can accept');
  if (current.state !== 'proposed') fail('INVALID_STATE', 'assignment is not pending');
  return touch(withAssignment(a, { ...current, state: 'accepted' }), { kind: 'accepted' }, by, now);
}

/** Returns the activity to the group, unassigned; the reason is mandatory. */
export function reject(a: Activity, by: AccountId, reason: string, now: Instant): Activity {
  const current = a.props.assignment;
  if (!current || current.assignee !== by) fail('FORBIDDEN', 'only the assignee can reject');
  if (reason.trim() === '') fail('REASON_REQUIRED', 'a reason is required to reject');
  return touch(withAssignment(a, undefined), { kind: 'rejected', detail: { reason, assignedBy: current.assignedBy } }, by, now);
}

/**
 * Whoever has it accepted gives it back: free in the group again. Unlike a rejection the reason is optional, since
 * the person took it on. A proposal is answered with accept or reject instead.
 */
export function release(a: Activity, by: AccountId, now: Instant, reason = ''): Activity {
  const current = a.props.assignment;
  if (!current) fail('INVALID_STATE', 'the activity is not assigned');
  if (current.assignee !== by) fail('FORBIDDEN', 'only the assignee can let it go');
  if (current.state !== 'accepted') fail('INVALID_STATE', 'a proposal is accepted or rejected');
  const why = reason.trim();
  return touch(withAssignment(a, undefined), { kind: 'released', detail: why ? { assignedBy: current.assignedBy, reason: why } : { assignedBy: current.assignedBy } }, by, now);
}

export function claim(a: Activity, by: AccountId, byRole: Role, now: Instant): Activity {
  requireNotGuest(byRole, 'claim');
  if (a.props.assignment) fail('INVALID_STATE', 'activity is already assigned');
  return touch(withAssignment(a, { state: 'accepted', assignee: by, assignedBy: by }), { kind: 'claimed' }, by, now);
}
