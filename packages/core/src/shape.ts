import type { AccountId, Activity, ActivityId, AttachmentRef, GroupId, Instant, Shape } from './types.js';

export interface NewActivityInput {
  id: ActivityId;
  accountId: AccountId;
  title: string;
  body?: string;
  attachments?: AttachmentRef[];
  groupId?: GroupId | null;
}

export function newActivity(input: NewActivityInput, now: Instant): Activity {
  return {
    id: input.id,
    accountId: input.accountId,
    groupId: input.groupId ?? null,
    title: input.title,
    body: input.body ?? '',
    attachments: input.attachments ?? [],
    props: {},
    status: 'open',
    overrides: {},
    history: [{ at: now, by: input.accountId, kind: 'created' }],
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

/** Derives the current form of an activity from its status and properties; first match wins. */
export function shapeOf(a: Activity, _personalGroupId: GroupId): Shape {
  const p = a.props;
  if (a.status === 'archived') return 'archived';
  if (a.status === 'done') return 'done';
  if (a.groupId === null) return 'draft';
  if (p.resumeAt) return 'snoozed';
  if (p.waitingFor && !p.waitingFor.metAt) return 'waiting';
  if (p.repeat) return 'recurring';
  if (p.schedule) return 'event';
  if (p.due || p.assignment) return 'task';
  return 'idea';
}
