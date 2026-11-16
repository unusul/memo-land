import { expect, test } from 'vitest';
import { DEFAULT_LIMITS, InMemoryBackend, resolveLimits } from '../src/index.js';
import { engineContract } from './engine-contract.js';
import { draft } from './fixtures.js';

engineContract('InMemoryEngine', async () => {
  const backend = new InMemoryBackend({ maxAttachmentBytes: 1024 });
  return account => backend.session(account);
});

test('testResolveLimitsOverrides', () => {
  const l = resolveLimits('google', { schedulerIntervalMinutes: 5 });
  expect(l).toEqual({ ...DEFAULT_LIMITS.google, schedulerIntervalMinutes: 5 });
  expect(DEFAULT_LIMITS.google.schedulerIntervalMinutes).toBe(10);
});

/** A change by anyone nudges every watching session at once; a stopped watch hears nothing more. */
test('testWatchChangesNudgesOtherSessions', async () => {
  const backend = new InMemoryBackend();
  const heard: string[] = [];
  const stop = backend.session('pippo').watchChanges(() => heard.push('nudge'));
  await backend.session('pluto').saveActivity({ ...draft, accountId: 'pluto' }, null);
  expect(heard).toEqual(['nudge']);
  stop();
  await backend.session('pluto').saveActivity({ ...draft, id: 'other', accountId: 'pluto' }, null);
  expect(heard).toEqual(['nudge']);
});

test('testMemoryEngineUsesMemoryDefaults', () => {
  expect(new InMemoryBackend().session('u1').limits).toEqual(DEFAULT_LIMITS.memory);
});
