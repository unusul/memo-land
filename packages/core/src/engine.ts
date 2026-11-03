import type { Group } from './groups.js';
import type { EngineLimits } from './limits.js';
import type { AccountId, Activity, ActivityId, AttachmentRef, GroupId } from './types.js';

export interface Change {
  cursor: string;
  type: 'activity' | 'group';
  id: string;
  deleted?: boolean;
}

export interface AttachmentUpload {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

/**
 * The single contract between the app and any engine (memory, central, Google).
 * A session is bound to one authenticated account: drafts are visible only to their
 * account, group data only to group members, and check-and-write is atomic.
 * Errors are DomainError: NOT_FOUND, FORBIDDEN, VERSION_CONFLICT, INVALID_INPUT.
 */
export interface Engine {
  readonly kind: string;
  readonly limits: EngineLimits;
  readonly account: AccountId;
  getGroup(id: GroupId): Promise<Group>;
  listGroups(): Promise<Group[]>;
  /** expectedVersion null creates; returns the new version. */
  saveGroup(group: Group, expectedVersion: number | null): Promise<number>;
  getActivity(id: ActivityId): Promise<{ activity: Activity }>;
  /** groupId null lists the session account's drafts. */
  listActivities(groupId: GroupId | null): Promise<Activity[]>;
  /** expectedVersion null creates; returns the stored activity with version + 1. */
  saveActivity(activity: Activity, expectedVersion: number | null): Promise<Activity>;
  putAttachment(activityId: ActivityId, file: AttachmentUpload): Promise<AttachmentRef>;
  getAttachment(ref: AttachmentRef): Promise<Uint8Array>;
  changesSince(cursor: string | null): Promise<{ changes: Change[]; cursor: string }>;
}
