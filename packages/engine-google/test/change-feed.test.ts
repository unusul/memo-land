import { expect, test } from 'vitest';
import { doc, setDoc } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import { draft } from '@attivita/core/test/fixtures';
import { TEAM, openWithTeam, testEnv } from './local-firebase.js';

const pad = (seq: number) => String(seq).padStart(12, '0');

async function asAdmin(fn: (db: Firestore) => Promise<void>): Promise<void> {
  await (await testEnv()).withSecurityRulesDisabled(ctx => fn(ctx.firestore() as unknown as Firestore));
}

/**
 * engine-central re-reads a window below the cursor because a bigserial can commit out of order. Here every
 * save reads and writes meta/counter in its transaction, so seqs commit in order and that window would only
 * re-read (and pay for, on the free plan's daily reads) rows already delivered. A row that shows up below the
 * cursor can only be a hand-made one: it is not delivered.
 */
test('testRowsBelowTheCursorAreNotReread', async () => {
  const e = (await openWithTeam())('pippo');
  const mine = { ...draft, accountId: 'pippo', groupId: 'team' };
  await e.saveActivity(mine, null);
  const start = Number((await e.changesSince(null)).cursor);
  const row = (seq: number) => ({ type: 'activity', id: mine.id, groupId: 'team', accountId: 'pippo', seq, at: new Date() });
  const early = start + 1;
  const later = start + 2;
  await asAdmin(async db => { await setDoc(doc(db, `changes/${pad(later)}`), row(later)); });
  const first = await e.changesSince(String(start));
  expect(first.changes.map(c => c.cursor)).toEqual([String(later)]);
  await asAdmin(async db => { await setDoc(doc(db, `changes/${pad(early)}`), row(early)); });
  expect((await e.changesSince(first.cursor)).changes).toEqual([]);
});

/** At startup the app lists everything anyway: a null cursor returns the current position, not the history. */
test('testNullCursorStartsAtTheCurrentPosition', async () => {
  const e = (await openWithTeam())('pippo');
  for (const id of ['d1', 'd2', 'd3']) await e.saveActivity({ ...draft, id, accountId: 'pippo', groupId: 'team' }, null);
  expect(await e.changesSince(null)).toEqual({ changes: [], cursor: '4' });
});

/** A removed member must learn about the removal, so its app drops the group. */
test('testRemovedMemberSeesTheGroupChange', async () => {
  const open = await openWithTeam({ pluto: 'member' });
  const { cursor } = await open('pluto').changesSince(null);
  await open('pippo').saveGroup({ ...TEAM, members: { pippo: 'owner' }, version: 3 }, 3);
  const r = await open('pluto').changesSince(cursor);
  expect(r.changes).toEqual([expect.objectContaining({ type: 'group', id: 'team' })]);
  expect(await open('pluto').listGroups()).toEqual([]);
});

/** Moving an activity to a group pluto is not in tells pluto, a member of the old group, too. */
test('testMoveToAnotherGroupIsLoggedForTheOldGroup', async () => {
  const open = await openWithTeam({ pluto: 'member' });
  await open('pippo').saveGroup({ ...TEAM, id: 'other', name: 'other' }, null);
  const a = await open('pippo').saveActivity({ ...draft, accountId: 'pippo', groupId: 'team' }, null);
  const { cursor } = await open('pluto').changesSince(null);
  await open('pippo').saveActivity({ ...a, groupId: 'other' }, a.version);
  expect((await open('pluto').changesSince(cursor)).changes.map(c => c.id)).toEqual([a.id]);
});
