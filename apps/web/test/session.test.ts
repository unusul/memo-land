import { expect, test, vi } from 'vitest';
import { DomainError, EngineUnavailableError } from '@attivita/core';
import { TIMED_OUT, chooseStartup, resolveOnboarding, withinStartupWait } from '../src/session/onboarding.js';

/** Before the fix a failed onboarding call (no network) sent the user back to the login screen. */
test('testOfflineStartupFallsBackToCachedIdentity', async () => {
  const r = await resolveOnboarding('Pippo@Altereos.com', async () => { throw new TypeError('Failed to fetch'); });
  expect(r).toEqual({ account: 'pippo@altereos.com', personalGroupId: 'personal:pippo@altereos.com', offline: true });
});

test('testOnlineStartupUsesServerAnswer', async () => {
  const r = await resolveOnboarding('pippo@altereos.com', async () => ({ account: 'pippo@altereos.com', personalGroupId: 'personal:pippo@altereos.com', domainGroupId: 'domain:altereos.com' }));
  expect(r).toEqual({ account: 'pippo@altereos.com', personalGroupId: 'personal:pippo@altereos.com', offline: false });
});

/** Before the fix any server fault (expired JWT, 500) opened the app "offline" with a guessed identity. */
test('testServerFaultsAreNotTreatedAsOffline', async () => {
  await expect(resolveOnboarding('x@y.it', async () => { throw new Error('JWT expired'); })).rejects.toThrow('JWT expired');
  const r = await resolveOnboarding('x@y.it', async () => { throw new EngineUnavailableError('down'); });
  expect(r.offline).toBe(true);
});

/** Before the fix an expired token offline returned no session and showed the login screen. */
test('testStartupChoosesOfflineWithCachedAccount', () => {
  expect(chooseStartup({ sessionEmail: 'a@b.it', cachedEmail: null, online: false, serverUnreachable: false })).toEqual({ kind: 'session', email: 'a@b.it' });
  expect(chooseStartup({ sessionEmail: null, cachedEmail: 'a@b.it', online: false, serverUnreachable: false })).toEqual({ kind: 'offline', email: 'a@b.it' });
  expect(chooseStartup({ sessionEmail: null, cachedEmail: 'a@b.it', online: true, serverUnreachable: false })).toEqual({ kind: 'login' });
  expect(chooseStartup({ sessionEmail: null, cachedEmail: null, online: false, serverUnreachable: false })).toEqual({ kind: 'login' });
});

/**
 * Only the device's network counted: with the network up and the server down (a paused free project, an outage)
 * the expired token could not be refreshed and the app showed the login screen, although the stored session was
 * still good. An unreachable server now opens the last account offline, like a missing network.
 */
test('testUnreachableServerOpensTheLastAccountOffline', () => {
  expect(chooseStartup({ sessionEmail: null, cachedEmail: 'a@b.it', online: true, serverUnreachable: true })).toEqual({ kind: 'offline', email: 'a@b.it' });
  expect(chooseStartup({ sessionEmail: null, cachedEmail: null, online: true, serverUnreachable: true })).toEqual({ kind: 'login' });
});

/** The auth client retried the refresh for about a minute while the app showed only "Apro memo-land…". */
test('testStartupWaitsForTheServerOnlyBriefly', async () => {
  vi.useFakeTimers();
  try {
    const never = new Promise<string>(() => undefined);
    const waited = withinStartupWait(never, 5_000);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await waited).toBe(TIMED_OUT);
    expect(await withinStartupWait(Promise.resolve('ok'), 5_000)).toBe('ok');
  } finally {
    vi.useRealTimers();
  }
});

test('testPermissionErrorsAreNotHidden', async () => {
  await expect(resolveOnboarding('x@y.it', async () => { throw new DomainError('FORBIDDEN', 'no'); })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
