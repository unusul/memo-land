import { expect, test } from 'vitest';
import { newActivity } from '@attivita/core';
import { mergeByVersion } from '../src/workspace/useWorkspace.js';

const base = newActivity({ id: 'a', accountId: 'u', title: 'x' }, '2026-11-04T08:00:00Z');

/** Before the fix a reload that started before a save landed afterwards and put the old version back. */
test('testReloadNeverReplacesANewerVersion', () => {
  const saved = { ...base, title: 'new', version: 3 };
  const staleLoad = [{ ...base, title: 'old', version: 2 }, { ...base, id: 'b', version: 1 }];
  const merged = mergeByVersion([saved], staleLoad);
  expect(merged.find(a => a.id === 'a')?.title).toBe('new');
  expect(merged.map(a => a.id).sort()).toEqual(['a', 'b']);
});

test('testReloadDropsActivitiesNoLongerVisible', () => {
  expect(mergeByVersion([{ ...base, version: 5 }], [])).toEqual([]);
});
