import { expect, test } from 'vitest';
import { DomainError, InMemoryBackend, newActivity } from '@attivita/core';
import type { Activity, Engine } from '@attivita/core';
import { enqueueDraft, flushOutbox, memoryOutboxStore } from '../src/offline/outbox.js';
import { PIPPO } from './memory-session.js';

const t1 = '2026-11-04T08:00:00Z';
const draftOf = (id: string): Activity => newActivity({ id, accountId: PIPPO, title: `idea ${id}` }, t1);

function failingEngine(error: Error, account = PIPPO): Engine {
  const fail = async () => { throw error; };
  return new Proxy({ account } as Engine, { get: (t, p) => (p === 'account' ? account : p === 'then' ? undefined : fail) });
}

/** The draft is persisted before any network call; a later session (after a restart) sends it once. */
test('testQueuedDraftSurvivesRestartAndIsSentOnce', async () => {
  const store = memoryOutboxStore();
  const backend = new InMemoryBackend();
  await enqueueDraft(store, PIPPO, draftOf('d1'), [], t1);
  const r = await flushOutbox(store, backend.session(PIPPO));
  expect(r).toEqual({ sent: 1, failed: 0 });
  expect(await store.list(PIPPO)).toEqual([]);
  expect(await backend.session(PIPPO).listActivities(null)).toHaveLength(1);
});

/** Two tabs share the IndexedDB data but not the in-memory guard: the second create conflicts and counts as sent. */
test('testTwoTabsFlushingSendOnce', async () => {
  const shared = memoryOutboxStore();
  const otherTab = memoryOutboxStore(shared.data);
  const backend = new InMemoryBackend();
  await enqueueDraft(shared, PIPPO, draftOf('d2'), [], t1);
  const s = backend.session(PIPPO);
  await Promise.all([flushOutbox(shared, s), flushOutbox(otherTab, s)]);
  expect(await s.listActivities(null)).toHaveLength(1);
  expect(await shared.list(PIPPO)).toEqual([]);
});

test('testNetworkErrorKeepsEntry', async () => {
  const store = memoryOutboxStore();
  await enqueueDraft(store, PIPPO, draftOf('d3'), [], t1);
  const r = await flushOutbox(store, failingEngine(new TypeError('Failed to fetch')));
  expect(r).toEqual({ sent: 0, failed: 1 });
  expect(await store.list(PIPPO)).toHaveLength(1);
});

test('testAttachmentsUploadedWithDraft', async () => {
  const store = memoryOutboxStore();
  const backend = new InMemoryBackend();
  await enqueueDraft(store, PIPPO, draftOf('d4'), [{ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([7]) }], t1);
  await flushOutbox(store, backend.session(PIPPO));
  const [a] = await backend.session(PIPPO).listActivities(null);
  expect(a?.attachments.map(f => f.name)).toEqual(['a.png']);
  expect(Array.from(await backend.session(PIPPO).getAttachment(a!.attachments[0]!))).toEqual([7]);
});

/** Before the fix the retry hit VERSION_CONFLICT on the create, counted it as sent and dropped the files. */
test('testAttachmentUploadFailureResumesOnNextFlush', async () => {
  const store = memoryOutboxStore();
  const backend = new InMemoryBackend();
  const real = backend.session(PIPPO);
  let uploads = 0;
  const flaky = new Proxy(real, { get: (t, p) => p === 'putAttachment' ? async () => { throw new TypeError('Failed to fetch'); } : Reflect.get(t, p) });
  await enqueueDraft(store, PIPPO, draftOf('d6'), [{ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }, { name: 'b.png', mimeType: 'image/png', bytes: new Uint8Array([2]) }], t1);
  expect(await flushOutbox(store, flaky)).toEqual({ sent: 0, failed: 1 });
  expect(await store.list(PIPPO)).toHaveLength(1);
  const counting = new Proxy(real, { get: (t, p) => p === 'putAttachment' ? (...a: unknown[]) => { uploads++; return (t.putAttachment as (...x: unknown[]) => unknown)(...a); } : Reflect.get(t, p) });
  expect(await flushOutbox(store, counting as typeof real)).toEqual({ sent: 1, failed: 0 });
  const [a] = await real.listActivities(null);
  expect(a?.attachments.map(f => f.name)).toEqual(['a.png', 'b.png']);
  expect(uploads).toBe(2);
});

/** Files already uploaded before an interruption are not uploaded twice. */
test('testUploadedFilesAreNotRepeated', async () => {
  const store = memoryOutboxStore();
  const backend = new InMemoryBackend();
  const real = backend.session(PIPPO);
  let calls = 0;
  const failSecondSave = new Proxy(real, { get: (t, p) => p === 'saveActivity' ? async (x: Activity, v: number | null) => { if (++calls === 2) throw new TypeError('Failed to fetch'); return t.saveActivity(x, v); } : Reflect.get(t, p) });
  await enqueueDraft(store, PIPPO, draftOf('d7'), [{ name: 'a.png', mimeType: 'image/png', bytes: new Uint8Array([1]) }], t1);
  expect((await flushOutbox(store, failSecondSave)).failed).toBe(1);
  await flushOutbox(store, real);
  const [a] = await real.listActivities(null);
  expect(a?.attachments).toHaveLength(1);
  expect(backend.blobs.size).toBe(1);
});

test('testRejectedEntryIsKeptWithReason', async () => {
  const store = memoryOutboxStore();
  await enqueueDraft(store, PIPPO, draftOf('d8'), [], t1);
  await flushOutbox(store, failingEngine(new DomainError('FORBIDDEN', 'no')));
  expect((await store.list(PIPPO))[0]?.error).toBe('FORBIDDEN');
});

test('testOnlyOwnEntriesAreFlushed', async () => {
  const store = memoryOutboxStore();
  await enqueueDraft(store, 'pluto@altereos.com', { ...draftOf('d5'), accountId: 'pluto@altereos.com' }, [], t1);
  expect(await flushOutbox(store, new InMemoryBackend().session(PIPPO))).toEqual({ sent: 0, failed: 0 });
  expect(await store.list('pluto@altereos.com')).toHaveLength(1);
});
