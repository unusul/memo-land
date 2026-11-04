import { DomainError } from '@attivita/core';
import type { AccountId, Activity, AttachmentRef, Engine, Instant } from '@attivita/core';

export interface QueuedFile {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface OutboxEntry {
  id: string;
  account: AccountId;
  activity: Activity;
  files: QueuedFile[];
  createdAt: Instant;
  /** Files already uploaded, in order: a retry continues from here instead of uploading again. */
  uploaded?: AttachmentRef[];
  /** Set when the engine refused the draft (not a network problem): it stays queued and is shown. */
  error?: string;
}

export interface OutboxStore {
  put(entry: OutboxEntry): Promise<void>;
  list(account: AccountId): Promise<OutboxEntry[]>;
  remove(id: string): Promise<void>;
}

/** In-memory store for tests; pass the same `data` to get a second store over it, like a second tab. */
export function memoryOutboxStore(data = new Map<string, OutboxEntry>()): OutboxStore & { data: Map<string, OutboxEntry> } {
  return {
    data,
    async put(e) { data.set(e.id, structuredClone(e)); },
    async list(account) { return [...data.values()].filter(e => e.account === account).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(e => structuredClone(e)); },
    async remove(id) { data.delete(id); },
  };
}

/** Persists the draft before any network call, so closing the app cannot lose it. */
export async function enqueueDraft(store: OutboxStore, account: AccountId, activity: Activity, files: QueuedFile[], now: Instant): Promise<void> {
  await store.put({ id: activity.id, account, activity, files, createdAt: now });
}

export interface FlushResult {
  sent: number;
  failed: number;
}

const inFlight = new WeakMap<object, Promise<FlushResult>>();

type Locks = { request<T>(name: string, cb: () => Promise<T>): Promise<T> };

/** Sends queued drafts in order. Tabs take turns through a Web Lock where the browser has one. */
export function flushOutbox(store: OutboxStore, engine: Engine): Promise<FlushResult> {
  const running = inFlight.get(store);
  if (running) return running;
  const locks = (globalThis.navigator as unknown as { locks?: Locks } | undefined)?.locks;
  const job = () => sendAll(store, engine);
  const run = (locks ? locks.request('attivita-outbox', job) : job()).finally(() => inFlight.delete(store));
  inFlight.set(store, run);
  return run;
}

async function sendAll(store: OutboxStore, engine: Engine): Promise<FlushResult> {
  const result = { sent: 0, failed: 0 };
  for (const entry of await store.list(engine.account)) {
    if (await sendOne(entry, store, engine)) { await store.remove(entry.id); result.sent++; } else result.failed++;
  }
  return result;
}

/**
 * Idempotent: finds or creates the draft, uploads only the files not uploaded yet, then links the ones
 * the stored activity is missing. The entry goes away only when the stored activity has all its files.
 */
async function sendOne(entry: OutboxEntry, store: OutboxStore, engine: Engine): Promise<boolean> {
  try {
    let current = await findOrCreate(entry, engine);
    const refs = [...(entry.uploaded ?? [])];
    for (let i = refs.length; i < entry.files.length; i++) {
      refs.push(await engine.putAttachment(current.id, entry.files[i]!));
      await store.put({ ...entry, uploaded: refs });
    }
    for (let attempt = 0; ; attempt++) {
      const missing = refs.filter(r => !current.attachments.some(x => x.id === r.id));
      if (missing.length === 0) return true;
      try {
        current = await engine.saveActivity({ ...current, attachments: [...current.attachments, ...missing] }, current.version);
      } catch (e) {
        if (!(isConflict(e) && attempt === 0)) throw e;
        current = (await engine.getActivity(current.id)).activity;
      }
    }
  } catch (e) {
    if (e instanceof DomainError && e.code !== 'VERSION_CONFLICT') await store.put({ ...entry, error: e.code });
    return false;
  }
}

async function findOrCreate(entry: OutboxEntry, engine: Engine): Promise<Activity> {
  try {
    return (await engine.getActivity(entry.activity.id)).activity;
  } catch (e) {
    if (!(e instanceof DomainError && e.code === 'NOT_FOUND')) throw e;
  }
  try {
    return await engine.saveActivity({ ...entry.activity, attachments: [] }, null);
  } catch (e) {
    if (!isConflict(e)) throw e;
    return (await engine.getActivity(entry.activity.id)).activity;
  }
}

const isConflict = (e: unknown) => e instanceof DomainError && e.code === 'VERSION_CONFLICT';
