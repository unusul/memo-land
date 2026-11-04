import { beforeEach, expect, test } from 'vitest';
import { openLocalUser, resetDatabase } from './local-supabase.js';

beforeEach(resetDatabase);

test('testDomainUsersShareTheDomainGroup', async () => {
  const pippo = await openLocalUser('pippo@altereos.com');
  const pluto = await openLocalUser('pluto@altereos.com');
  const a = await pippo.onboard();
  const b = await pluto.onboard();
  expect(a.domainGroupId).toBe('domain:altereos.com');
  expect(b.domainGroupId).toBe('domain:altereos.com');
  expect(Object.keys((await pluto.getGroup('domain:altereos.com')).members).sort()).toEqual(['pippo@altereos.com', 'pluto@altereos.com']);
  expect(a.personalGroupId).toBe('personal:pippo@altereos.com');
  expect((await pippo.getGroup(a.personalGroupId)).members).toEqual({ 'pippo@altereos.com': 'owner' });
});

test('testPublicDomainGetsNoDomainGroup', async () => {
  const u = await openLocalUser('mario.rossi@gmail.com');
  expect((await u.onboard()).domainGroupId).toBeNull();
  expect((await u.listGroups()).map(g => g.id)).toEqual(['personal:mario.rossi@gmail.com']);
});

test('testOnboardIsIdempotent', async () => {
  const u = await openLocalUser('paperino@altereos.com');
  expect(await u.onboard()).toEqual(await u.onboard());
});

test('testDomainMemberCannotRemoveAnotherViaRpc', async () => {
  const pippo = await openLocalUser('pippo@altereos.com'); await pippo.onboard();
  const pluto = await openLocalUser('pluto@altereos.com'); await pluto.onboard();
  const g = await pippo.getGroup('domain:altereos.com');
  const { ['pluto@altereos.com']: _gone, ...members } = g.members;
  await expect(pippo.saveGroup({ ...g, members }, g.version)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await expect(pippo.saveGroup({ ...g, members: { ...g.members, 'ext@gmail.com': 'guest' } }, g.version)).rejects.toMatchObject({ code: 'FORBIDDEN' });
});

/** A voluntary leave sticks: the next login does not re-add the account unless it asks to rejoin. */
test('testDomainMemberCanLeaveAndOnlyRejoinsOnRequest', async () => {
  const pluto = await openLocalUser('pluto@altereos.com'); await pluto.onboard();
  const g = await pluto.getGroup('domain:altereos.com');
  const { ['pluto@altereos.com']: _me, ...members } = g.members;
  await pluto.saveGroup({ ...g, members }, g.version);
  expect((await pluto.listGroups()).map(x => x.id)).toEqual(['personal:pluto@altereos.com']);
  expect((await pluto.onboard()).domainGroupId).toBeNull();
  expect((await pluto.onboard(true)).domainGroupId).toBe('domain:altereos.com');
});
