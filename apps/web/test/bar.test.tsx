import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { MAX_PINS, pinsOf, setPins } from '../src/groups/barPrefs.js';
import { MeView } from '../src/me/MeView.js';
import { Shell } from '../src/shell/Shell.js';
import { noteChoice } from '../src/usage/choicesStore.js';
import { seedUsage } from '../src/usage/usageStore.js';
import { PIPPO, groupRow, manage, memorySession, renderWithSession, userClick } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
});
afterEach(() => vi.useRealTimers());

const nav = () => screen.findByRole('navigation', { name: 'Sezioni' });
const groupButtons = (n: HTMLElement) => within(n).getAllByRole('button').filter(b => b.classList.contains('sub'));
const label = (b: HTMLElement) => (b.getAttribute('aria-label') ?? '').split(',')[0];
const inBar = () => within(screen.getByRole('list', { name: 'In barra' })).getAllByRole('button', { name: /^Apri / }).map(b => b.getAttribute('aria-label')!.slice(5).split(',')[0]);
/** From a group's page back to the rows of Noi. */
const backToNoi = () => userClick('Indietro');

async function withFourMoreGroups() {
  const s = memorySession(PIPPO);
  for (const n of ['a', 'b', 'c', 'd']) {
    await s.primary.saveGroup({ id: `inv:${n}`, kind: 'invite', name: `gruppo ${n}`, ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 }, null);
  }
  return s;
}

/** The bar fills itself: the pinned groups in the person's order, then the most used; the personal group lives in Io. */
test('testBarIsPinnedInOrderThenMostUsedWithoutPersonal', async () => {
  setPins(PIPPO, ['inv:d', 'inv:developers']);
  noteChoice(PIPPO, 'group', 'domain:altereos.com');
  renderWithSession(<Shell />, await withFourMoreGroups());
  const n = await nav();
  await within(n).findByRole('button', { name: /^gruppo d/ });
  expect(groupButtons(n).map(label)).toEqual(['gruppo d', 'developers', 'altereos.com', 'gruppo a', 'gruppo b']);
  // Phones have room for three: the others are only on wide screens.
  expect(groupButtons(n).map(b => b.classList.contains('wide-only'))).toEqual([false, false, false, true, true]);
});

test('testNoiListsSharedGroupsOnly', async () => {
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  await groupRow('altereos.com');
  expect(screen.getByRole('heading', { name: 'Noi' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Apri Idee personali/ })).toBeNull();
});

test('testPinAndArrowsReorderTheBar', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  fireEvent.click(within(await nav()).getByRole('button', { name: 'Noi' }));
  await manage('developers');
  userClick('Metti developers in barra');
  expect(screen.getByText('In barra, 1° posto')).toBeTruthy();
  backToNoi();
  await manage('altereos.com');
  userClick('Metti altereos.com in barra');
  backToNoi();
  expect(inBar()).toEqual(['developers', 'altereos.com']);
  await manage('altereos.com');
  userClick('Sposta su altereos.com');
  backToNoi();
  expect(inBar()).toEqual(['altereos.com', 'developers']);
  expect(pinsOf(PIPPO)).toEqual(['domain:altereos.com', 'inv:developers']);
  expect(groupButtons(await nav()).map(label)).toEqual(['altereos.com', 'developers']);
  await manage('developers');
  userClick('Togli developers dalla barra');
  backToNoi();
  expect(inBar()).toEqual(['altereos.com']);
});

test('testPinBeyondTheLimitIsRefused', async () => {
  setPins(PIPPO, ['inv:a', 'inv:b', 'inv:c']);
  renderWithSession(<GroupsView />, await withFourMoreGroups());
  await manage('gruppo d');
  userClick('Metti gruppo d in barra');
  expect(screen.getByRole('alert').textContent).toMatch(`In barra ci stanno ${MAX_PINS} gruppi`);
  expect(pinsOf(PIPPO)).toEqual(['inv:a', 'inv:b', 'inv:c']);
});

/** A group with no icon chosen shows its initial; the chosen icon reaches the menu at once. */
test('testChosenIconShowsInTheMenu', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  const n = await nav();
  const dev = () => groupButtons(n).find(b => label(b) === 'developers')!;
  await waitFor(() => expect(dev().querySelector('.initial')?.textContent).toBe('D'));
  fireEvent.click(within(n).getByRole('button', { name: 'Noi' }));
  await manage('developers');
  userClick('Icona di developers');
  userClick('Musica');
  expect(dev().querySelector('svg[data-icon="music"]')).toBeTruthy();
  userClick('Icona di developers');
  userClick('Iniziale');
  expect(dev().querySelector('.initial')?.textContent).toBe('D');
});

/** The picker shows the icons by section, so the person finds one by what the group is for. */
test('testIconPickerIsSplitInSections', async () => {
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  await manage('developers');
  userClick('Icona di developers');
  const picker = screen.getByRole('group', { name: "Scegli l'icona di developers" });
  const sections = within(picker).getAllByRole('group').map(s => s.getAttribute('aria-label'));
  expect(sections).toEqual(['Cose da fare', 'In team', 'Lavori di casa', 'Casa e persone', 'Tempo libero', 'Luoghi e cose', 'Altro']);
  const home = within(picker).getByRole('group', { name: 'Lavori di casa' });
  expect(within(home).getAllByRole('button').map(b => b.getAttribute('aria-label'))).toEqual(['Pulizie', 'Bucato', 'Riparazioni', 'Rifiuti', 'Bollette', 'Bambini']);
  expect(within(picker).getAllByRole('group').flatMap(g => within(g).getAllByRole('button'))).toHaveLength(36);
});

test('testGearOpensSettingsWithAccountAndSignOut', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  const gear = await screen.findByRole('button', { name: 'Impostazioni' });
  fireEvent.click(gear);
  expect(await screen.findByText(PIPPO)).toBeTruthy();
  expect(screen.getByRole('button', { name: "Esci dall'account" })).toBeTruthy();
  expect(gear.getAttribute('aria-current')).toBe('page');
});

test('testIoHoldsDraftsPersonalActivitiesAndQueue', async () => {
  const s = memorySession(PIPPO);
  await s.primary.saveActivity(newActivity({ id: 'p1', accountId: PIPPO, title: 'leggere il libro', groupId: `personal:${PIPPO}` }, '2026-11-01T08:00:00Z'), null);
  renderWithSession(<MeView />, s);
  expect(await screen.findByText('app gestione core')).toBeTruthy();
  const personal = await screen.findByRole('region', { name: 'Elenco di Idee personali' });
  expect(within(personal).getByText('leggere il libro')).toBeTruthy();
  expect(screen.queryByText(PIPPO)).toBeNull();
  expect(screen.queryByRole('button', { name: "Esci dall'account" })).toBeNull();
});

/** The counts beside the properties told how often each was used: gone, the order by use stays. */
test('testPropertyChipsHaveNoUseCount', async () => {
  seedUsage(PIPPO, { assignment: 3, due: 1 });
  renderWithSession(<ActivityDetail activityId="sal" onClose={() => undefined} />, memorySession(PIPPO));
  await screen.findByRole('heading', { name: 'Stato avanzamento' });
  const chips = screen.getAllByRole('button').filter(b => b.classList.contains('chip'));
  expect(chips.map(c => c.textContent).join(' ')).not.toMatch('×');
  expect(chips[0]!.textContent).toMatch('Assegna');
});
