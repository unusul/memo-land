import { deleteApp, initializeApp } from 'firebase/app';
import type { FirebaseApp } from 'firebase/app';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { AccountId, Group } from '@attivita/core';
import type { SessionFactory } from '@attivita/core/test/engine-contract';
import { GoogleEngine } from '../src/index.js';

export const PROJECT_ID = 'demo-memo-land';
const [HOST, PORT] = ((import.meta as { env?: Record<string, string | undefined> }).env?.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':') as [string, string];

let env: RulesTestEnvironment | null = null;
let apps: FirebaseApp[] = [];
let opened = 0;

/** Admin access to the emulator (rules off), for clearing and for tests that tamper with stored data. */
export async function testEnv(): Promise<RulesTestEnvironment> {
  env ??= await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { host: HOST, port: Number(PORT) } });
  return env;
}

/** The group pippo owns in the tests: the Google engine keeps no drafts, so every activity needs one. */
export const TEAM: Group = { id: 'team', kind: 'invite', name: 'team', ownerId: 'pippo', timeZone: 'Europe/Rome', members: { pippo: 'owner' }, version: 1 };

/** A fresh backend where pippo owns TEAM, with the given extra members. */
export async function openWithTeam(members: Group['members'] = {}): Promise<SessionFactory> {
  const open = await openEmulatorBackend();
  const v = await open('pippo').saveGroup(TEAM, null);
  if (Object.keys(members).length) await open('pippo').saveGroup({ ...TEAM, members: { ...TEAM.members, ...members }, version: v }, v);
  return open;
}

/**
 * A fresh emulator database and one Firestore client per account. Each client carries an emulator token
 * whose verified email is the account id itself, as the rules compare token.email with accountId.
 */
export async function openEmulatorBackend(): Promise<SessionFactory> {
  await (await testEnv()).clearFirestore();
  await Promise.all(apps.map(a => deleteApp(a)));
  apps = [];
  const sessions = new Map<AccountId, GoogleEngine>();
  const backend = ++opened;
  return account => {
    let engine = sessions.get(account);
    if (!engine) {
      const app = initializeApp({ projectId: PROJECT_ID, apiKey: 'demo-key' }, `b${backend}-${account}`);
      apps.push(app);
      const db = getFirestore(app);
      connectFirestoreEmulator(db, HOST, Number(PORT), { mockUserToken: { sub: account, user_id: account, email: account, email_verified: true } });
      engine = new GoogleEngine(db, account);
      sessions.set(account, engine);
    }
    return engine;
  };
}
