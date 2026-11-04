import { describe, expect, test } from 'vitest';
import type { AccountId, Engine, Group } from '../src/index.js';
import { draft } from './fixtures.js';

/** An invite group every engine can create: domain and personal groups come from onboarding. */
const team: Group = { id: 'team', kind: 'invite', name: 'team', ownerId: 'pippo', timeZone: 'Europe/Rome', members: { pippo: 'owner' }, version: 1 };

/** Opens a session on one shared backend for the given account. */
export type SessionFactory = (account: AccountId) => Engine;

/** Behaviour every engine (memory, Supabase, Google) must provide; later engines import this suite. */
export function engineContract(name: string, makeBackend: () => Promise<SessionFactory>): void {
  const groupActivity = { ...draft, id: 'g-act', accountId: 'pippo', groupId: 'team' };

  async function withTeam(): Promise<SessionFactory> {
    const open = await makeBackend();
    const v = await open('pippo').saveGroup(team, null);
    await open('pippo').saveGroup({ ...team, members: { pippo: 'owner', pluto: 'member' }, version: v }, v);
    return open;
  }

  describe(name, () => {
    test('testCreateThenReadRoundTrip', async () => {
      const e = (await makeBackend())('u1');
      const saved = await e.saveActivity(draft, null);
      expect(saved.version).toBe(2);
      expect((await e.getActivity(draft.id)).activity).toEqual(saved);
    });

    test('testCreateExistingIdConflicts', async () => {
      const e = (await makeBackend())('u1');
      await e.saveActivity(draft, null);
      await expect(e.saveActivity(draft, null)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    });

    test('testConcurrentSaveFromSameVersionConflicts', async () => {
      const e = (await makeBackend())('u1');
      const v = await e.saveActivity(draft, null);
      await e.saveActivity({ ...v, title: 'pippo edit' }, v.version);
      await expect(e.saveActivity({ ...v, title: 'pluto edit' }, v.version)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      expect((await e.getActivity(draft.id)).activity.title).toBe('pippo edit');
    });

    /** Engines must make check-and-write atomic: of two truly parallel saves exactly one wins. */
    test('testParallelSavesExactlyOneWins', async () => {
      const open = await withTeam();
      const v = await open('pippo').saveActivity(groupActivity, null);
      const results = await Promise.allSettled([
        open('pippo').saveActivity({ ...v, title: 'pippo edit' }, v.version),
        open('pluto').saveActivity({ ...v, title: 'pluto edit' }, v.version),
      ]);
      expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      expect(results.find(r => r.status === 'rejected')).toMatchObject({ reason: { code: 'VERSION_CONFLICT' } });
    });

    test('testMissingActivityIsNotFound', async () => {
      const e = (await makeBackend())('u1');
      await expect(e.getActivity('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
    });

    test('testDraftsArePrivateToTheirAccount', async () => {
      const open = await makeBackend();
      await open('u1').saveActivity(draft, null);
      expect((await open('u1').listActivities(null)).map(a => a.id)).toEqual([draft.id]);
      expect(await open('u2').listActivities(null)).toEqual([]);
      await expect(open('u2').getActivity(draft.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(open('u2').saveActivity({ ...draft, title: 'hijack' }, 2)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect((await open('u2').changesSince(null)).changes).toEqual([]);
    });

    test('testGroupActivitiesVisibleOnlyToMembers', async () => {
      const open = await withTeam();
      await open('pippo').saveActivity(groupActivity, null);
      expect((await open('pluto').listActivities('team')).map(a => a.id)).toEqual(['g-act']);
      await expect(open('stranger').listActivities('team')).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(open('stranger').getActivity('g-act')).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(open('stranger').saveActivity({ ...groupActivity, id: 'x' }, null)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect((await open('stranger').changesSince(null)).changes).toEqual([]);
    });

    test('testGroupsSavedAndListedByMember', async () => {
      const open = await makeBackend();
      expect(await open('pippo').saveGroup(team, null)).toBe(2);
      expect((await open('pippo').listGroups()).map(g => g.id)).toEqual(['team']);
      expect(await open('stranger').listGroups()).toEqual([]);
      await expect(open('stranger').getGroup('team')).rejects.toMatchObject({ code: 'FORBIDDEN' });
      await expect(open('pippo').saveGroup(team, 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
      await expect(open('stranger').saveGroup({ ...team, id: 't2' }, null)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    });

    test('testChangesSinceReturnsOnlyNewChanges', async () => {
      const e = (await makeBackend())('u1');
      const { cursor } = await e.changesSince(null);
      await e.saveActivity(draft, null);
      const r = await e.changesSince(cursor);
      expect(r.changes.map(c => c.id)).toEqual([draft.id]);
      expect((await e.changesSince(r.cursor)).changes).toEqual([]);
    });

    test('testAttachmentRoundTripAndLimit', async () => {
      const open = await makeBackend();
      const e = open('u1');
      await e.saveActivity(draft, null);
      const ref = await e.putAttachment(draft.id, { name: 'shot.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
      expect(ref).toMatchObject({ name: 'shot.png', mimeType: 'image/png', size: 3 });
      expect(Array.from(await e.getAttachment(ref))).toEqual([1, 2, 3]);
      await expect(open('u2').getAttachment(ref)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      const big = new Uint8Array(e.limits.maxAttachmentBytes + 1);
      await expect(e.putAttachment(draft.id, { name: 'x.bin', mimeType: 'application/octet-stream', bytes: big })).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    });

    test('testReturnedObjectsAreCopies', async () => {
      const e = (await makeBackend())('u1');
      const s = await e.saveActivity(draft, null);
      s.title = 'mutated';
      expect((await e.getActivity(draft.id)).activity.title).toBe('app gestione core');
    });
  });
}
