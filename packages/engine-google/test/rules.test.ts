import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Bytes, collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, where, writeBatch,
} from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';
import rules from '../../../firebase/firestore.rules?raw';

/**
 * Server-side checks of the Google engine, mirroring supabase/tests/security_test.sql: every write here goes
 * straight to Firestore, as a member could do with the SDK or REST, bypassing the app.
 */
const env = await initializeTestEnvironment({ projectId: 'demo-memo-land', firestore: { rules } });
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

const OWNER = 'owner@else.test';
const MEMBER = 'member@else.test';
const GUEST = 'guest@else.test';
const STRANGER = 'stranger@evil.test';

function as(email: string, verified = true): Firestore {
  return env.authenticatedContext(email, { email, email_verified: verified }).firestore() as unknown as Firestore;
}

async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore() as unknown as Firestore, path), data); });
}

const pad = (seq: number) => String(seq).padStart(12, '0');

/** Writes a group or activity the way the engine does: in a transaction with its change row and the counter. */
async function write(db: Firestore, path: string, data: Record<string, unknown>, seqStep = 1): Promise<void> {
  const [collectionName, id] = path.split('/') as [string, string];
  const row = collectionName === 'groups'
    ? { type: 'group', id, groupId: id, accountId: null }
    : { type: 'activity', id, groupId: data['groupId'] ?? null, accountId: data['accountId'] };
  await runTransaction(db, async tx => {
    const counter = await tx.get(doc(db, 'meta/counter'));
    const seq = (counter.exists() ? Number(counter.get('value')) : 0) + seqStep;
    tx.set(doc(db, path), data);
    tx.set(doc(db, `changes/${pad(seq)}`), { ...row, seq, at: serverTimestamp() });
    tx.set(doc(db, 'meta/counter'), { value: seq });
  });
}

function group(members: Record<string, string>, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'team', kind: 'invite', name: 'team', ownerId: OWNER, timeZone: 'Europe/Rome',
    members, memberIds: Object.keys(members), version: 3, ...extra,
  };
}

function activity(id: string, accountId: string, groupId: string | null, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id, accountId, groupId, title: 't', body: '', attachments: [], props: {}, status: 'open', overrides: {}, history: [],
    createdAt: '2026-11-04T10:00:00Z', updatedAt: '2026-11-04T10:00:00Z', version: 2, ...extra,
  };
}

const TEAM = { [OWNER]: 'owner', [MEMBER]: 'member', [GUEST]: 'guest' };
const seedTeam = () => seed('groups/team', group(TEAM));

describe('firestore rules', () => {
  test('testUnverifiedEmailCannotReadOrWrite', async () => {
    const unverified = 'unverified@acme.test';
    await seed('activities/d1', activity('d1', unverified, null));
    const db = as(unverified, false);
    await assertFails(getDoc(doc(db, 'activities/d1')));
    await assertFails(write(db, 'activities/d2', activity('d2', unverified, null)));
    await assertFails(write(db, 'groups/mine', group({ [unverified]: 'owner' }, { id: 'mine', ownerId: unverified, version: 2 })));
    await assertFails(getDocs(query(collection(db, 'groups'), where('memberIds', 'array-contains', unverified))));
  });

  test('testOnlyInviteGroupsCanBeCreated', async () => {
    const db = as(OWNER);
    const mine = { [OWNER]: 'owner' };
    await assertFails(write(db, 'groups/team', group(mine, { kind: 'domain', version: 2 })));
    await assertFails(write(db, 'groups/team', group(mine, { kind: 'personal', version: 2 })));
    await assertSucceeds(write(db, 'groups/team', group(mine, { version: 2 })));
  });

  test('testNewGroupStartsWithCreatorAsOnlyOwner', async () => {
    const db = as(OWNER);
    await assertFails(write(db, 'groups/team', group({ [OWNER]: 'owner', [MEMBER]: 'member' }, { version: 2 })));
    await assertFails(write(db, 'groups/team', group({ [OWNER]: 'owner' }, { ownerId: MEMBER, version: 2 })));
    await assertFails(write(db, 'groups/team', group({ [OWNER]: 'owner' }, { version: 1 })));
    await assertFails(write(db, 'groups/team', group({ [OWNER]: 'owner' }, { version: 2, memberIds: [OWNER, MEMBER] })));
    await assertSucceeds(write(db, 'groups/team', group({ [OWNER]: 'owner' }, { version: 2 })));
  });

  test('testGuestCannotTakeOverGroup', async () => {
    await seedTeam();
    const takeover = group({ [GUEST]: 'owner', [MEMBER]: 'member' }, { ownerId: GUEST, name: 'mine', version: 4 });
    await assertFails(write(as(GUEST), 'groups/team', takeover));
  });

  test('testGuestCannotInvite', async () => {
    await seedTeam();
    await assertFails(write(as(GUEST), 'groups/team', group({ ...TEAM, [STRANGER]: 'member' }, { version: 4 })));
  });

  test('testGuestCannotCreateActivities', async () => {
    await seedTeam();
    await assertFails(write(as(GUEST), 'activities/a1', activity('a1', GUEST, 'team')));
    await assertSucceeds(write(as(MEMBER), 'activities/a2', activity('a2', MEMBER, 'team')));
  });

  test('testGuestUpdatesOnlyItsAssignments', async () => {
    await seedTeam();
    const assigned = { assignment: { state: 'proposed', assignee: GUEST, assignedBy: OWNER } };
    await seed('activities/mine', activity('mine', OWNER, 'team', { props: assigned }));
    await seed('activities/other', activity('other', OWNER, 'team'));
    const db = as(GUEST);
    await assertSucceeds(write(db, 'activities/mine', activity('mine', OWNER, 'team', { props: assigned, status: 'done', version: 3 })));
    await assertFails(write(db, 'activities/other', activity('other', OWNER, 'team', { title: 'x', version: 3 })));
  });

  test('testGuestCannotPromoteItself', async () => {
    await seedTeam();
    await assertFails(write(as(GUEST), 'groups/team', group({ ...TEAM, [GUEST]: 'member' }, { version: 4 })));
  });

  test('testGuestCanLeave', async () => {
    await seedTeam();
    await assertSucceeds(write(as(GUEST), 'groups/team', group({ [OWNER]: 'owner', [MEMBER]: 'member' }, { version: 4 })));
  });

  test('testMemberCannotRemoveOwner', async () => {
    await seedTeam();
    await assertFails(write(as(MEMBER), 'groups/team', group({ [MEMBER]: 'member', [GUEST]: 'guest' }, { version: 4 })));
  });

  test('testMemberCannotMakeItselfOwner', async () => {
    await seedTeam();
    const swapped = group({ [OWNER]: 'member', [MEMBER]: 'owner', [GUEST]: 'guest' }, { ownerId: MEMBER, version: 4 });
    await assertFails(write(as(MEMBER), 'groups/team', swapped));
  });

  test('testMemberCannotRenameGroup', async () => {
    await seedTeam();
    await assertFails(write(as(MEMBER), 'groups/team', group(TEAM, { name: 'renamed', version: 4 })));
    await assertSucceeds(write(as(OWNER), 'groups/team', group(TEAM, { name: 'renamed', version: 4 })));
  });

  test('testMemberCanInviteGuest', async () => {
    await seedTeam();
    await assertSucceeds(write(as(MEMBER), 'groups/team', group({ ...TEAM, [STRANGER]: 'guest' }, { version: 4 })));
  });

  test('testVersionMustIncrementByOne', async () => {
    await seedTeam();
    await seed('activities/a1', activity('a1', OWNER, 'team'));
    const db = as(MEMBER);
    await assertFails(write(db, 'activities/a1', activity('a1', OWNER, 'team', { title: 'same version' })));
    await assertFails(write(db, 'activities/a1', activity('a1', OWNER, 'team', { title: 'skip', version: 4 })));
    await assertSucceeds(write(db, 'activities/a1', activity('a1', OWNER, 'team', { title: 'ok', version: 3 })));
    await assertFails(write(as(OWNER), 'groups/team', group(TEAM, { name: 'skip', version: 5 })));
  });

  /**
   * Drafts live on the central engine. Here they were private to their account, which let anyone with the
   * project config and a Google account store data on the owner's quota: now no activity is outside a group.
   */
  test('testDraftsAreRefused', async () => {
    await assertFails(write(as(STRANGER), 'activities/d1', activity('d1', STRANGER, null)));
    await seedTeam();
    await seed('activities/a1', activity('a1', MEMBER, 'team'));
    await assertFails(write(as(MEMBER), 'activities/a1', activity('a1', MEMBER, null, { version: 3 })));
    // A missing id is readable, so the engine can tell NOT_FOUND from FORBIDDEN without revealing content.
    expect((await assertSucceeds(getDoc(doc(as(STRANGER), 'activities/nope')))).exists()).toBe(false);
  });

  test('testAccountIdNeverChanges', async () => {
    await seedTeam();
    await seed('activities/a1', activity('a1', OWNER, 'team'));
    await assertFails(write(as(MEMBER), 'activities/a1', activity('a1', MEMBER, 'team', { version: 3 })));
  });

  /** A write that skips its change row would stay invisible to the other members' apps. */
  test('testWritesWithoutChangeRowAreRefused', async () => {
    await seedTeam();
    await seed('activities/a1', activity('a1', OWNER, 'team'));
    await assertFails(setDoc(doc(as(MEMBER), 'activities/a1'), activity('a1', OWNER, 'team', { title: 'silent', version: 3 })));
    await assertFails(setDoc(doc(as(OWNER), 'groups/team'), group(TEAM, { name: 'silent', version: 4 })));
    await assertSucceeds(write(as(MEMBER), 'activities/a1', activity('a1', OWNER, 'team', { title: 'logged', version: 3 })));
  });

  /** A counter pushed past 12 digits would make every later change id invalid: it grows only by small steps. */
  test('testCounterCannotJump', async () => {
    // Anyone may create a group of their own, so that is the write a stranger would abuse.
    const own = group({ [STRANGER]: 'owner' }, { id: 'own', ownerId: STRANGER, version: 2 });
    await assertFails(write(as(STRANGER), 'groups/own', own, 999_999_999_999));
    await assertFails(write(as(STRANGER), 'groups/own', own, 1000));
    await assertSucceeds(write(as(STRANGER), 'groups/own', own));
  });

  test('testBlobsFollowActivityVisibility', async () => {
    await seedTeam();
    await seed('activities/a1', activity('a1', OWNER, 'team'));
    const upload = (db: Firestore, ref: string) => {
      const b = writeBatch(db);
      b.set(doc(db, `blobs/${ref}`), { activityId: 'a1', name: 'x.bin', mimeType: 'application/octet-stream', size: 3, chunks: 1 });
      b.set(doc(db, `blobs/${ref}/chunks/0`), { data: Bytes.fromUint8Array(new Uint8Array([1, 2, 3])) });
      return b.commit();
    };
    await assertSucceeds(upload(as(MEMBER), 'r1'));
    await assertFails(upload(as(STRANGER), 'r2'));
    await assertFails(getDoc(doc(as(STRANGER), 'blobs/r1')));
    await assertFails(getDocs(collection(as(STRANGER), 'blobs/r1/chunks')));
    expect((await assertSucceeds(getDocs(collection(as(GUEST), 'blobs/r1/chunks')))).size).toBe(1);
  });

  test('testRemovedMemberCanReadTheGroupChange', async () => {
    await seedTeam();
    await seed('meta/counter', { value: 5 });
    const db = as(OWNER);
    const forged = writeBatch(db);
    forged.set(doc(db, 'changes/000000000006'), { type: 'group', id: 'team', groupId: 'team', accountId: GUEST, seq: 6, at: serverTimestamp() });
    forged.set(doc(db, 'meta/counter'), { value: 6 });
    await assertFails(forged.commit());
    await seed('activities/a1', activity('a1', OWNER, 'team'));
    const noWrite = writeBatch(db);
    noWrite.set(doc(db, 'changes/000000000006'), { type: 'activity', id: 'a1', groupId: 'team', accountId: OWNER, seq: 6, at: serverTimestamp() });
    noWrite.set(doc(db, 'meta/counter'), { value: 6 });
    await assertFails(noWrite.commit());

    const removal = writeBatch(db);
    removal.set(doc(db, 'groups/team'), group({ [OWNER]: 'owner', [MEMBER]: 'member' }, { version: 4 }));
    removal.set(doc(db, 'changes/000000000006'), { type: 'group', id: 'team', groupId: 'team', accountId: GUEST, seq: 6, at: serverTimestamp() });
    removal.set(doc(db, 'meta/counter'), { value: 6 });
    await assertSucceeds(removal.commit());

    const guest = as(GUEST);
    const mine = await assertSucceeds(getDocs(query(collection(guest, 'changes'), where('type', '==', 'group'), where('accountId', '==', GUEST))));
    expect(mine.docs.map(d => d.id)).toEqual(['000000000006']);
    await assertFails(getDocs(query(collection(guest, 'changes'), where('groupId', '==', 'team'))));
  });
});
