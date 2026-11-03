import { expect, test } from 'vitest';
import { DEFAULT_LIMITS, InMemoryBackend, resolveLimits } from '../src/index.js';
import { engineContract } from './engine-contract.js';

engineContract('InMemoryEngine', async () => {
  const backend = new InMemoryBackend({ maxAttachmentBytes: 1024 });
  return account => backend.session(account);
});

test('testResolveLimitsOverrides', () => {
  const l = resolveLimits('google', { schedulerIntervalMinutes: 5 });
  expect(l).toEqual({ ...DEFAULT_LIMITS.google, schedulerIntervalMinutes: 5 });
  expect(DEFAULT_LIMITS.google.schedulerIntervalMinutes).toBe(10);
});

test('testMemoryEngineUsesMemoryDefaults', () => {
  expect(new InMemoryBackend().session('u1').limits).toEqual(DEFAULT_LIMITS.memory);
});
