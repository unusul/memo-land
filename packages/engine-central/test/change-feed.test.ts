import { expect, test } from 'vitest';
import { draft } from '@attivita/core/test/fixtures';
import { admin, openLocalBackend } from './local-supabase.js';

/**
 * A bigserial cursor can commit out of order: N+1 may be visible before N. Before the fix the client
 * cursor moved past N for good and that change was never delivered. The test takes both cursors from the
 * sequence (so later inserts never collide), hides N, reads, then makes N visible again.
 */
test('testLateCommittedChangeIsStillDelivered', async () => {
  const open = await openLocalBackend();
  const e = open('pippo');
  const mine = { ...draft, accountId: 'pippo' };
  await e.saveActivity(mine, null);
  const start = (await e.changesSince(null)).cursor;
  const row = { type: 'activity', id: mine.id, account_id: 'pippo', group_id: null };
  const { data: early } = await admin().from('changes').insert(row).select('cursor').single();
  const { data: later } = await admin().from('changes').insert(row).select('cursor').single();
  await admin().from('changes').delete().eq('cursor', early!.cursor);

  const first = await e.changesSince(start);
  expect(first.changes.map(c => c.cursor)).toEqual([String(later!.cursor)]);
  await admin().from('changes').insert({ ...row, cursor: early!.cursor });
  const second = await e.changesSince(first.cursor);
  expect(second.changes.map(c => c.cursor)).toEqual([String(early!.cursor)]);
  expect((await e.changesSince(second.cursor)).changes).toEqual([]);
});
