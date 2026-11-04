import type { SupabaseClient } from '@supabase/supabase-js';
import { fail, resolveLimits } from '@attivita/core';
import type {
  AccountId, Activity, ActivityId, AttachmentRef, AttachmentUpload, Change, Engine, EngineLimits, Group, GroupId, Role,
} from '@attivita/core';
import { toDomainError } from './errors.js';

interface GroupRow { id: string; kind: Group['kind']; name: string; domain: string | null; owner_id: string | null; time_zone: string; version: number }
interface MemberRow { group_id: string; account_id: string; role: Role }

const BUCKET = 'attachments';
/** How far below the cursor each read looks for late commits, and how many delivered cursors to remember. */
const CHANGE_LOOKBACK = 200;
const DELIVERED_MAX = 5_000;

export interface Onboarding {
  account: AccountId;
  personalGroupId: GroupId;
  domainGroupId: GroupId | null;
}

/** Engine on a Supabase project; RLS filters reads, SQL functions do atomic, checked writes. */
export class CentralEngine implements Engine {
  readonly kind = 'central';
  readonly drafts = true;
  readonly limits: EngineLimits;
  private readonly delivered = new Set<string>();

  constructor(private readonly db: SupabaseClient, readonly account: AccountId, limits: Partial<EngineLimits> = {}) {
    this.limits = resolveLimits('central', limits);
  }

  async getGroup(id: GroupId): Promise<Group> {
    const [group] = await this.loadGroups([id]);
    if (group) return group;
    return fail(await this.rpc<boolean>('group_exists', { gid: id }) ? 'FORBIDDEN' : 'NOT_FOUND', `group ${id}`);
  }

  async listGroups(): Promise<Group[]> {
    return this.loadGroups(null);
  }

  async saveGroup(group: Group, expectedVersion: number | null): Promise<number> {
    return this.rpc<number>('save_group', { doc: group, expected: expectedVersion });
  }

  async getActivity(id: ActivityId): Promise<{ activity: Activity }> {
    const { data, error } = await this.db.from('activities').select('doc').eq('id', id).maybeSingle();
    if (error) throw toDomainError(error);
    if (data) return { activity: data.doc as Activity };
    return fail(await this.rpc<boolean>('activity_exists', { act_id: id }) ? 'FORBIDDEN' : 'NOT_FOUND', `activity ${id}`);
  }

  async listActivities(groupId: GroupId | null): Promise<Activity[]> {
    if (groupId !== null) await this.getGroup(groupId);
    const base = this.db.from('activities').select('doc');
    const { data, error } = await (groupId === null ? base.is('group_id', null).eq('account_id', this.account) : base.eq('group_id', groupId));
    if (error) throw toDomainError(error);
    return (data ?? []).map(r => r.doc as Activity);
  }

  async saveActivity(activity: Activity, expectedVersion: number | null): Promise<Activity> {
    return this.rpc<Activity>('save_activity', { doc: activity, expected: expectedVersion });
  }

  async putAttachment(activityId: ActivityId, file: AttachmentUpload): Promise<AttachmentRef> {
    await this.getActivity(activityId);
    if (file.bytes.byteLength > this.limits.maxAttachmentBytes) fail('INVALID_INPUT', 'attachment exceeds the size limit');
    const path = `${activityId}/${crypto.randomUUID()}`;
    const { error } = await this.db.storage.from(BUCKET).upload(path, file.bytes, { contentType: file.mimeType });
    if (error) throw toDomainError(error);
    return { id: path, name: file.name, mimeType: file.mimeType, size: file.bytes.byteLength };
  }

  async getAttachment(ref: AttachmentRef): Promise<Uint8Array> {
    await this.getActivity(ref.id.split('/')[0] ?? '');
    const { data, error } = await this.db.storage.from(BUCKET).download(ref.id);
    if (error || !data) return fail('NOT_FOUND', `attachment ${ref.id}`);
    return new Uint8Array(await data.arrayBuffer());
  }

  /**
   * Cursors are a bigserial, and concurrent transactions can commit N after N+1 was read. Each call
   * re-reads a window below the cursor and skips what this session already delivered.
   */
  async changesSince(cursor: string | null): Promise<{ changes: Change[]; cursor: string }> {
    const from = cursor === null ? 0 : Number(cursor);
    if (!Number.isInteger(from) || from < 0) fail('INVALID_INPUT', `invalid cursor "${cursor}"`);
    const { data, error } = await this.db.from('changes').select('cursor, type, id')
      .gt('cursor', Math.max(0, from - CHANGE_LOOKBACK)).order('cursor');
    if (error) throw toDomainError(error);
    const fresh = (data ?? [])
      .map(r => ({ cursor: String(r.cursor), type: r.type as Change['type'], id: r.id as string }))
      .filter(c => Number(c.cursor) > from || !this.delivered.has(c.cursor));
    for (const c of fresh) this.remember(c.cursor);
    const top = Math.max(from, ...fresh.map(c => Number(c.cursor)));
    return { changes: fresh, cursor: String(top) };
  }

  private remember(c: string): void {
    this.delivered.add(c);
    if (this.delivered.size > DELIVERED_MAX) this.delivered.delete(this.delivered.values().next().value!);
  }

  /** Creates the account and personal group if missing, and joins the email-domain group unless left before. */
  async onboard(rejoinDomain = false): Promise<Onboarding> {
    const account = await this.rpc<string>('ensure_account', {});
    const domainGroupId = await this.rpc<string | null>('join_domain_group', { rejoin: rejoinDomain });
    return { account, personalGroupId: `personal:${account}`, domainGroupId };
  }

  private async rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.db.rpc(fn, args);
    if (error) throw toDomainError(error);
    return data as T;
  }

  private async loadGroups(ids: GroupId[] | null): Promise<Group[]> {
    const g = this.db.from('groups').select('*');
    const { data: rows, error } = await (ids ? g.in('id', ids) : g);
    if (error) throw toDomainError(error);
    if (!rows?.length) return [];
    const { data: members, error: mErr } = await this.db.from('group_members').select('*').in('group_id', rows.map(r => r.id));
    if (mErr) throw toDomainError(mErr);
    return (rows as GroupRow[]).map(r => toGroup(r, (members ?? []) as MemberRow[]));
  }
}

function toGroup(r: GroupRow, members: MemberRow[]): Group {
  const g: Group = {
    id: r.id, kind: r.kind, name: r.name, timeZone: r.time_zone, version: r.version,
    members: Object.fromEntries(members.filter(m => m.group_id === r.id).map(m => [m.account_id, m.role])),
  };
  if (r.domain !== null) g.domain = r.domain;
  if (r.owner_id !== null) g.ownerId = r.owner_id;
  return g;
}
