import { expect, test } from 'vitest';
import { DomainError, EngineUnavailableError } from '@attivita/core';
import { chooseStartup, resolveOnboarding } from '../src/session/onboarding.js';

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
  expect(chooseStartup({ sessionEmail: 'a@b.it', cachedEmail: null, online: false })).toEqual({ kind: 'session', email: 'a@b.it' });
  expect(chooseStartup({ sessionEmail: null, cachedEmail: 'a@b.it', online: false })).toEqual({ kind: 'offline', email: 'a@b.it' });
  expect(chooseStartup({ sessionEmail: null, cachedEmail: 'a@b.it', online: true })).toEqual({ kind: 'login' });
  expect(chooseStartup({ sessionEmail: null, cachedEmail: null, online: false })).toEqual({ kind: 'login' });
});

test('testPermissionErrorsAreNotHidden', async () => {
  await expect(resolveOnboarding('x@y.it', async () => { throw new DomainError('FORBIDDEN', 'no'); })).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
