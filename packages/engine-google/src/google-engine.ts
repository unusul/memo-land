import {
  Bytes, collection, doc, documentId, getDoc, getDocs, query, runTransaction, serverTimestamp, where, writeBatch,
} from 'firebase/firestore';
import type { DocumentData, Firestore, QueryConstraint, Transaction } from 'firebase/firestore';
import { DomainError, fail, resolveLimits } from '@attivita/core';
import type {
  AccountId, Activity, ActivityId, AttachmentRef, AttachmentUpload, Change, Engine, EngineLimits, Group, GroupId,
} from '@attivita/core';
import { toDomainError } from './errors.js';

/** Firestore documents hold at most 1 MiB; chunks stay well below, and a batch below the 10 MiB request cap. */
const CHUNK_BYTES = 900 * 1024;
const CHUNKS_PER_BATCH = 8;
const SEQ_DIGITS = 12;

interface ChangeRow { type: Change['type']; id: string; groupId: GroupId; accountId: AccountId | null }

/**
 * Engine on a Firebase project of the group owner. Security rules (firebase/firestore.rules) enforce members,
 * roles and versions on the server; writes are transactions that also append to the change feed.
 */
export class GoogleEngine implements Engine {
  readonly kind = 'google';
  // A stranger with the project config could otherwise fill the owner's free quota with private drafts.
  readonly drafts = false;
  readonly limits: EngineLimits;

  constructor(private readonly db: Firestore, readonly account: AccountId, limits: Partial<EngineLimits> = {}) {
    this.limits = resolveLimits('google', { maxAttachmentBytes: 5_000_000, ...limits });
  }

  async getGroup(id: GroupId): Promise<Group> {
    const data = await this.read(`groups/${id}`, `group ${id}`);
    return fromStoredGroup(data);
  }

  async listGroups(): Promise<Group[]> {
    const rows = await this.list('groups', where('memberIds', 'array-contains', this.account));
    return rows.map(fromStoredGroup);
  }

  async saveGroup(group: Group, expectedVersion: number | null): Promise<number> {
    return this.transact(`groups/${group.id}`, expectedVersion, async tx => {
      const ref = doc(this.db, 'groups', group.id);
      const stored = await tx.get(ref);
      const next = checkVersion(stored.exists() ? Number(stored.get('version')) : null, expectedVersion, group.version, `group ${group.id}`);
      const rows: ChangeRow[] = [{ type: 'group', id: group.id, groupId: group.id, accountId: null }];
      const before = stored.exists() ? Object.keys(stored.get('members') ?? {}) : [];
      for (const gone of before.filter(m => !(m in group.members))) rows.push({ type: 'group', id: group.id, groupId: group.id, accountId: gone });
      await this.logChanges(tx, rows);
      tx.set(ref, toStoredGroup(group, next));
      return next;
    });
  }

  async getActivity(id: ActivityId): Promise<{ activity: Activity }> {
    return { activity: await this.read(`activities/${id}`, `activity ${id}`) as Activity };
  }

  async listActivities(groupId: GroupId | null): Promise<Activity[]> {
    if (groupId === null) return [];
    await this.getGroup(groupId);
    return (await this.list('activities', where('groupId', '==', groupId))) as Activity[];
  }

  async saveActivity(activity: Activity, expectedVersion: number | null): Promise<Activity> {
    const groupId = activity.groupId ?? fail('INVALID_INPUT', 'drafts live on the primary engine');
    return this.transact(`activities/${activity.id}`, expectedVersion, async tx => {
      const ref = doc(this.db, 'activities', activity.id);
      const stored = await tx.get(ref);
      const next = checkVersion(stored.exists() ? Number(stored.get('version')) : null, expectedVersion, activity.version, `activity ${activity.id}`);
      const saved = { ...plain(activity), version: next };
      const rows: ChangeRow[] = [{ type: 'activity', id: saved.id, groupId, accountId: saved.accountId }];
      const oldGroup = stored.exists() ? (stored.get('groupId') as GroupId) : groupId;
      // Moving to another group tells the old group too.
      if (oldGroup !== groupId) rows.push({ type: 'activity', id: saved.id, groupId: oldGroup, accountId: stored.get('accountId') });
      await this.logChanges(tx, rows);
      tx.set(ref, saved);
      return saved;
    });
  }

  async putAttachment(activityId: ActivityId, file: AttachmentUpload): Promise<AttachmentRef> {
    await this.getActivity(activityId);
    if (file.bytes.byteLength > this.limits.maxAttachmentBytes) fail('INVALID_INPUT', 'attachment exceeds the size limit');
    const id = crypto.randomUUID();
    const chunks = Math.max(1, Math.ceil(file.bytes.byteLength / CHUNK_BYTES));
    const ref: AttachmentRef = { id, name: file.name, mimeType: file.mimeType, size: file.bytes.byteLength };
    for (let first = 0; first < chunks; first += CHUNKS_PER_BATCH) {
      const batch = writeBatch(this.db);
      if (first === 0) batch.set(doc(this.db, 'blobs', id), { activityId, name: ref.name, mimeType: ref.mimeType, size: ref.size, chunks });
      for (let n = first; n < Math.min(chunks, first + CHUNKS_PER_BATCH); n++) {
        const data = file.bytes.subarray(n * CHUNK_BYTES, (n + 1) * CHUNK_BYTES);
        batch.set(doc(this.db, 'blobs', id, 'chunks', String(n)), { data: Bytes.fromUint8Array(data) });
      }
      await batch.commit().catch(e => { throw toDomainError(e); });
    }
    return ref;
  }

  async getAttachment(ref: AttachmentRef): Promise<Uint8Array> {
    const blob = await this.read(`blobs/${ref.id}`, `attachment ${ref.id}`);
    const parts = await getDocs(collection(this.db, 'blobs', ref.id, 'chunks')).catch(e => { throw toDomainError(e); });
    const ordered = parts.docs.sort((a, b) => Number(a.id) - Number(b.id)).map(d => (d.get('data') as Bytes).toUint8Array());
    if (ordered.length !== blob.chunks) fail('NOT_FOUND', `attachment ${ref.id} is incomplete`);
    const out = new Uint8Array(ordered.reduce((n, p) => n + p.byteLength, 0));
    ordered.reduce((at, p) => { out.set(p, at); return at + p.byteLength; }, 0);
    return out;
  }

  /**
   * Firestore only answers queries whose every result the rules allow, so the feed is read per scope: each
   * group the account is in, and its own removals. Every save reads and writes meta/counter in its
   * transaction, so seqs commit in order: unlike CentralEngine there is no late commit to look back for, and
   * each read costs only the new rows (Firestore bills every document read). A null cursor starts at the
   * current position, since the app lists everything at startup anyway.
   */
  async changesSince(cursor: string | null): Promise<{ changes: Change[]; cursor: string }> {
    if (cursor === null) {
      const counter = await getDoc(doc(this.db, 'meta', 'counter')).catch(e => { throw toDomainError(e); });
      return { changes: [], cursor: String(counter.exists() ? Number(counter.get('value')) : 0) };
    }
    const from = Number(cursor);
    if (!Number.isInteger(from) || from < 0) fail('INVALID_INPUT', `invalid cursor "${cursor}"`);
    const above = where(documentId(), '>', pad(from));
    const groups = await this.listGroups();
    const scopes = [
      ...groups.map(g => [where('groupId', '==', g.id)]),
      [where('type', '==', 'group'), where('accountId', '==', this.account)],
    ];
    const rows = new Map<string, DocumentData>();
    for (const found of await Promise.all(scopes.map(s => this.listWithIds('changes', ...s, above)))) {
      for (const [id, data] of found) rows.set(id, data);
    }
    const fresh = [...rows.values()]
      .map(r => ({ cursor: String(r.seq), type: r.type as Change['type'], id: r.id as string }))
      .sort((x, y) => Number(x.cursor) - Number(y.cursor));
    return { changes: fresh, cursor: String(Math.max(from, ...fresh.map(c => Number(c.cursor)))) };
  }

  /** Appends feed rows numbered from the project counter; the rules accept them only with the write they name. */
  private async logChanges(tx: Transaction, rows: ChangeRow[]): Promise<void> {
    const counterRef = doc(this.db, 'meta', 'counter');
    const counter = await tx.get(counterRef);
    let seq = counter.exists() ? Number(counter.get('value')) : 0;
    for (const r of rows) {
      seq += 1;
      tx.set(doc(this.db, 'changes', pad(seq)), { ...r, seq, at: serverTimestamp() });
    }
    tx.set(counterRef, { value: seq });
  }

  /**
   * The rules judge a commit against the stored doc: the loser of a race is refused with permission-denied
   * (its version is no longer stored + 1) before Firestore reports the stale read. A refused save therefore
   * re-reads the doc, and a version other than the expected one is a conflict.
   */
  private async transact<T>(path: string, expected: number | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    try {
      return await runTransaction(this.db, fn);
    } catch (e) {
      const err = toDomainError(e, { inTransaction: true });
      if (err instanceof DomainError && err.code === 'FORBIDDEN' && await this.movedPast(path, expected)) {
        return fail('VERSION_CONFLICT', path);
      }
      throw err;
    }
  }

  private async movedPast(path: string, expected: number | null): Promise<boolean> {
    const snap = await getDoc(doc(this.db, path)).catch(() => null);
    if (!snap) return false;
    return expected === null ? snap.exists() : snap.exists() && Number(snap.get('version')) !== expected;
  }

  /** A denied read is FORBIDDEN; the rules let a missing id through, so absence is NOT_FOUND. */
  private async read(path: string, what: string): Promise<DocumentData> {
    const snap = await getDoc(doc(this.db, path)).catch(e => { throw toDomainError(e); });
    const data = snap.data();
    return data ?? fail('NOT_FOUND', what);
  }

  private async list(path: string, ...filters: QueryConstraint[]): Promise<DocumentData[]> {
    return [...(await this.listWithIds(path, ...filters)).values()];
  }

  private async listWithIds(path: string, ...filters: QueryConstraint[]): Promise<Map<string, DocumentData>> {
    const snap = await getDocs(query(collection(this.db, path), ...filters)).catch(e => { throw toDomainError(e); });
    return new Map(snap.docs.map(d => [d.id, d.data()]));
  }
}

/** Version check of a save: null expected creates; the new version is one above what the caller saw. */
function checkVersion(stored: number | null, expected: number | null, given: number, what: string): number {
  if (expected === null ? stored !== null : stored !== expected) fail('VERSION_CONFLICT', what);
  return (expected ?? given) + 1;
}

function pad(seq: number): string {
  return String(seq).padStart(SEQ_DIGITS, '0');
}

/** Firestore rejects undefined values: store the JSON form, which is what the app reads back. */
function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function toStoredGroup(g: Group, version: number): DocumentData {
  return { ...plain(g), memberIds: Object.keys(g.members), version };
}

function fromStoredGroup(data: DocumentData): Group {
  const { memberIds: _ids, ...group } = data;
  return group as Group;
}
