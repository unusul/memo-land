import { afterAll, expect, test } from 'vitest';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-memo-land' });
afterAll(() => env.cleanup());

/** The emulator answers and stores documents; rules are bypassed so only the wiring is tested. */
test('testEmulatorWritesAndReadsADocument', async () => {
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'smoke/one'), { ok: true });
    expect((await getDoc(doc(db, 'smoke/one'))).data()).toEqual({ ok: true });
  });
});
