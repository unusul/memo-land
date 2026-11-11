import { act, renderHook, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { EngineUnavailableError, InMemoryBackend, backToDraft, moveToGroup, newActivity } from '@attivita/core';
import type { Engine, Group } from '@attivita/core';
import { EngineRouter } from '../src/workspace/routing.js';
import { useWorkspace } from '../src/workspace/useWorkspace.js';
import { PIPPO, PLUTO, benchBackend } from './memory-session.js';

const T0 = '2026-11-01T08:00:00Z';
const famiglia: Group = {
  id: 'famiglia', kind: 'invite', name: 'famiglia', ownerId: PIPPO, timeZone: 'Europe/Rome',
  members: { [PIPPO]: 'owner', [PLUTO]: 'member' }, version: 1,
};

/** A second engine (posing as a Google project) with one invite group and one activity in it. */
function googleLike(): InMemoryBackend {
  const b = new InMemoryBackend();
  b.groups.set(famiglia.id, structuredClone(famiglia));
  const spesa = newActivity({ id: 'spesa', accountId: PIPPO, title: 'Fare la spesa', groupId: famiglia.id }, T0);
  b.activities.set(spesa.id, spesa);
  return b;
}

function unreachable(account = PIPPO): Engine {
  const down = async () => { throw new EngineUnavailableError('Failed to fetch'); };
  return new Proxy({ account, kind: 'google' } as Engine, {
    get: (t, p) => (p === 'account' || p === 'kind' ? t[p as 'account'] : p === 'limits' ? { refreshIntervalSeconds: 60 } : p === 'then' ? undefined : down),
  });
}

test('testAgendaMergesTwoEngines', async () => {
  const a = benchBackend().session(PIPPO);
  const b = googleLike().session(PIPPO);
  const { result } = renderHook(() => useWorkspace([a, b]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.groups.map(g => g.id)).toEqual(expect.arrayContaining(['domain:altereos.com', 'famiglia']));
  expect(result.current.activities.map(x => x.title)).toEqual(expect.arrayContaining(['Controllo backup', 'Fare la spesa']));
});

test('testSaveGoesToTheOwningEngine', async () => {
  const a = benchBackend().session(PIPPO);
  const b = googleLike().session(PIPPO);
  const { result } = renderHook(() => useWorkspace([a, b]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const spesa = result.current.activities.find(x => x.id === 'spesa')!;
  await act(async () => { await result.current.save({ ...spesa, title: 'Spesa grande' }); });
  expect((await b.getActivity('spesa')).activity).toMatchObject({ title: 'Spesa grande', version: spesa.version + 1 });
  await expect(a.getActivity('spesa')).rejects.toMatchObject({ code: 'NOT_FOUND' });

  const backup = result.current.activities.find(x => x.id === 'backup')!;
  await act(async () => { await result.current.save({ ...backup, title: 'Backup' }); });
  expect((await a.getActivity('backup')).activity.version).toBe(backup.version + 1);
  await expect(b.getActivity('backup')).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('testDraftMovedToOtherEngineIsCopiedAndArchived', async () => {
  const a = benchBackend().session(PIPPO);
  const b = googleLike().session(PIPPO);
  const { result } = renderHook(() => useWorkspace([a, b]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const idea = result.current.drafts.find(x => x.id === 'idea')!;
  await act(async () => { await result.current.save(moveToGroup(idea, 'famiglia', PIPPO, T0)); });
  const copy = (await b.getActivity('idea')).activity;
  expect(copy).toMatchObject({ groupId: 'famiglia', title: idea.title });
  expect(copy.history.length).toBeGreaterThan(idea.history.length);
  expect((await a.getActivity('idea')).activity).toMatchObject({ groupId: null, status: 'archived' });
  expect(result.current.drafts.filter(d => d.status === 'open').map(d => d.id)).not.toContain('idea');
  expect(result.current.activities.filter(x => x.id === 'idea')).toEqual([expect.objectContaining({ groupId: 'famiglia' })]);
});

/** The way back: an activity of a group on another engine becomes a draft on the primary one; the group keeps it archived. */
test('testActivityBackToDraftFromOtherEngineIsCopiedAndArchived', async () => {
  const a = benchBackend().session(PIPPO);
  const b = googleLike().session(PIPPO);
  const { result } = renderHook(() => useWorkspace([a, b]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const spesa = result.current.activities.find(x => x.id === 'spesa')!;
  await act(async () => { await result.current.save(backToDraft(spesa, PIPPO, T0)); });
  expect((await a.getActivity('spesa')).activity).toMatchObject({ groupId: null, status: 'open', title: 'Fare la spesa' });
  expect((await b.getActivity('spesa')).activity).toMatchObject({ groupId: 'famiglia', status: 'archived' });
  expect(result.current.drafts.filter(d => d.status === 'open').map(d => d.id)).toContain('spesa');
});

/**
 * The copy used to keep the source engine's attachment refs: the files stayed on the source engine, so the moved
 * activity listed attachments nobody could open on the destination. The files now travel with the copy.
 */
test('testDraftMovedToOtherEngineKeepsItsAttachments', async () => {
  const a = benchBackend().session(PIPPO);
  const b = googleLike().session(PIPPO);
  const bytes = new Uint8Array([1, 2, 3, 4, 5]);
  const ref = await a.putAttachment('idea', { name: 'foto.png', mimeType: 'image/png', bytes });
  const stored = (await a.getActivity('idea')).activity;
  await a.saveActivity({ ...stored, attachments: [ref] }, stored.version);
  const { result } = renderHook(() => useWorkspace([a, b]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const idea = result.current.drafts.find(x => x.id === 'idea')!;
  await act(async () => { await result.current.save(moveToGroup(idea, 'famiglia', PIPPO, T0)); });
  const copy = (await b.getActivity('idea')).activity;
  expect(copy.attachments).toEqual([expect.objectContaining({ name: 'foto.png', mimeType: 'image/png', size: 5 })]);
  expect(await b.getAttachment(copy.attachments[0]!)).toEqual(bytes);
});

test('testMoveAcrossRefusesAttachmentsOverTheTargetLimit', async () => {
  const a = benchBackend().session(PIPPO);
  const tight = new InMemoryBackend({ maxAttachmentBytes: 3 });
  tight.groups.set(famiglia.id, structuredClone(famiglia));
  const b = tight.session(PIPPO);
  const ref = await a.putAttachment('idea', { name: 'foto.png', mimeType: 'image/png', bytes: new Uint8Array(5) });
  const stored = (await a.getActivity('idea')).activity;
  await a.saveActivity({ ...stored, attachments: [ref] }, stored.version);
  const { result } = renderHook(() => useWorkspace([a, b]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  const idea = result.current.drafts.find(x => x.id === 'idea')!;
  await act(async () => {
    await expect(result.current.save(moveToGroup(idea, 'famiglia', PIPPO, T0))).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
  await expect(b.getActivity('idea')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect((await a.getActivity('idea')).activity).toMatchObject({ groupId: null, status: 'open' });
});

test('testOneEngineDownKeepsTheOtherUsable', async () => {
  const a = benchBackend().session(PIPPO);
  const { result } = renderHook(() => useWorkspace([a, unreachable()]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.groups.map(g => g.id)).toContain('domain:altereos.com');
  expect(result.current.notices.join(' ')).toMatch(/non è raggiungibile/);
  expect(result.current.error).toBeNull();
});

/**
 * Before the workspace spoke to several engines, an unreachable engine at startup surfaced as the generic
 * error "Qualcosa non ha funzionato" and the workspace never became loaded. Now every engine, the primary
 * one included, reports a notice and the workspace loads with what it has: the same path for one or many.
 */
test('testUnreachablePrimaryIsANoticeNotAnError', async () => {
  const { result } = renderHook(() => useWorkspace([unreachable()]));
  await waitFor(() => expect(result.current.loaded).toBe(true));
  expect(result.current.notices).toHaveLength(1);
  expect(result.current.error).toBeNull();
});

test('testRouterSendsDraftsToPrimaryAndRejectsUnknownGroups', () => {
  const a = benchBackend().session(PIPPO);
  const b = googleLike().session(PIPPO);
  const r = new EngineRouter([a, b]);
  r.register([famiglia], b);
  expect(r.forGroup(null)).toBe(a);
  expect(r.forGroup('famiglia')).toBe(b);
  expect(() => r.forGroup('nope')).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
});
