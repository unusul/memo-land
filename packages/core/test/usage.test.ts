import { expect, test } from 'vitest';
import { DEFAULT_PROP_ORDER, rankProps, recordUse } from '../src/index.js';
import type { UsageStats } from '../src/index.js';

test('testRankPropsByUsageWithStableTies', () => {
  let s: UsageStats = {};
  s = recordUse(recordUse(recordUse(s, 'waitingFor'), 'waitingFor'), 'repeat');
  expect(rankProps(s)).toEqual(['waitingFor', 'repeat', 'due', 'schedule', 'assignment', 'resumeAt', 'parentId']);
});

test('testNoUsageKeepsDefaultOrder', () => {
  expect(rankProps({})).toEqual([...DEFAULT_PROP_ORDER]);
});

test('testRecordUseDoesNotMutate', () => {
  const s: UsageStats = { due: 1 };
  expect(recordUse(s, 'due')).toEqual({ due: 2 });
  expect(s).toEqual({ due: 1 });
});
