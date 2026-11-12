import type { AttachmentUpload, Change, Engine } from './engine.js';
import { fail } from './errors.js';
import type { Group } from './groups.js';
import { resolveLimits } from './limits.js';
import type { EngineLimits } from './limits.js';
import type { AccountId, Activity, ActivityId, AttachmentRef, GroupId } from './types.js';

/** Shared in-memory storage for tests; open one session per account. */
export class InMemoryBackend {
  readonly limits: EngineLimits;
  readonly groups = new Map<GroupId, Group>();
  readonly activities = new Map<ActivityId, Activity>();
  readonly blobs = new Map<string, { activityId: ActivityId; bytes: Uint8Array }>();
  readonly log: Change[] = [];

  constructor(limits: Partial<EngineLimits> = {}) {
    this.limits = resolveLimits('memory', limits);
  }

  session(account: AccountId): InMemoryEngine {
    return new InMemoryEngine(this, account);
  }

  record(type: Change['type'], id: string): void {
    this.log.push({ cursor: String(this.log.length + 1), type, id });
  }
}

/** Reference engine; stores deep copies, and check-and-write runs without awaiting in between. */
export class InMemoryEngine implements Engine {
  readonly kind = 'memory';
  readonly drafts = true;

  constructor(private readonly store: InMemoryBackend, readonly account: AccountId) {}

  get limits(): EngineLimits {
    return this.store.limits;
  }

  async getGroup(id: GroupId): Promise<Group> {
    return structuredClone(this.visibleGroup(id));
  }

  async listGroups(): Promise<Group[]> {
    return [...this.store.groups.values()].filter(g => this.account in g.members).map(g => structuredClone(g));
  }

  async saveGroup(group: Group, expectedVersion: number | null): Promise<number> {
    const stored = this.store.groups.get(group.id);
    if (!(this.account in (stored ?? group).members)) fail('FORBIDDEN', 'not a member of this group');
    if (group.kind !== 'invite' && group.archived) fail('FORBIDDEN', 'only invite groups are archived');
    // As save_group and the Firestore rules: in an invite group only the owner changes name, type, archive, owner, time zone.
    if (stored?.kind === 'invite' && stored.members[this.account] !== 'owner'
      && (group.name !== stored.name || group.type !== stored.type || group.archived !== stored.archived
        || group.ownerId !== stored.ownerId || group.timeZone !== stored.timeZone)) {
      fail('FORBIDDEN', 'only the owner changes the group');
    }
    checkVersion(stored?.version, expectedVersion);
    const version = (expectedVersion ?? group.version) + 1;
    this.store.groups.set(group.id, structuredClone({ ...group, version }));
    this.store.record('group', group.id);
    return version;
  }

  async getActivity(id: ActivityId): Promise<{ activity: Activity }> {
    const a = this.store.activities.get(id) ?? fail('NOT_FOUND', `activity ${id} not found`);
    this.requireVisible(a);
    return { activity: structuredClone(a) };
  }

  async listActivities(groupId: GroupId | null): Promise<Activity[]> {
    if (groupId !== null) this.visibleGroup(groupId);
    return [...this.store.activities.values()]
      .filter(a => a.groupId === groupId && this.isVisible(a))
      .map(a => structuredClone(a));
  }

  async saveActivity(activity: Activity, expectedVersion: number | null): Promise<Activity> {
    const stored = this.store.activities.get(activity.id);
    if (stored) this.requireVisible(stored);
    this.requireVisible(activity);
    checkVersion(stored?.version, expectedVersion);
    const saved = { ...activity, version: (expectedVersion ?? activity.version) + 1 };
    this.store.activities.set(activity.id, structuredClone(saved));
    this.store.record('activity', activity.id);
    return structuredClone(saved);
  }

  async putAttachment(activityId: ActivityId, file: AttachmentUpload): Promise<AttachmentRef> {
    await this.getActivity(activityId);
    if (file.bytes.byteLength > this.limits.maxAttachmentBytes) fail('INVALID_INPUT', 'attachment exceeds the size limit');
    const id = `${activityId}/${this.store.blobs.size + 1}`;
    this.store.blobs.set(id, { activityId, bytes: file.bytes.slice() });
    return { id, name: file.name, mimeType: file.mimeType, size: file.bytes.byteLength };
  }

  async getAttachment(ref: AttachmentRef): Promise<Uint8Array> {
    const blob = this.store.blobs.get(ref.id) ?? fail('NOT_FOUND', `attachment ${ref.id} not found`);
    await this.getActivity(blob.activityId);
    return blob.bytes.slice();
  }

  async changesSince(cursor: string | null): Promise<{ changes: Change[]; cursor: string }> {
    const from = cursor === null ? 0 : Number(cursor);
    if (!Number.isInteger(from) || from < 0) fail('INVALID_INPUT', `invalid cursor "${cursor}"`);
    const changes = this.store.log.slice(from).filter(c => this.canSee(c)).map(c => ({ ...c }));
    return { changes, cursor: String(this.store.log.length) };
  }

  private canSee(c: Change): boolean {
    if (c.type === 'group') return this.account in (this.store.groups.get(c.id)?.members ?? {});
    const a = this.store.activities.get(c.id);
    return a !== undefined && this.isVisible(a);
  }

  private isVisible(a: Activity): boolean {
    if (a.groupId === null) return a.accountId === this.account;
    return this.account in (this.store.groups.get(a.groupId)?.members ?? {});
  }

  private requireVisible(a: Activity): void {
    if (!this.isVisible(a)) fail('FORBIDDEN', 'activity not visible to this account');
  }

  private visibleGroup(id: GroupId): Group {
    const g = this.store.groups.get(id) ?? fail('NOT_FOUND', `group ${id} not found`);
    if (!(this.account in g.members)) fail('FORBIDDEN', 'not a member of this group');
    return g;
  }
}

/** Creation (null) requires absence; an update requires the stored version to match. */
function checkVersion(stored: number | undefined, expected: number | null): void {
  if (expected === null ? stored !== undefined : stored !== expected) {
    fail('VERSION_CONFLICT', `expected version ${expected}, found ${stored ?? 'none'}`);
  }
}
