import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { listActivityId } from '@attivita/core';
import { App } from '../src/App.js';
import { DEMO_ACCOUNT, isDemoUrl, openDemoSession } from '../src/demo/demo.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { LoginScreen } from '../src/session/LoginScreen.js';
import { SettingsView } from '../src/settings/SettingsView.js';
import { today } from '../src/dates.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => localStorage.clear());

const login = { sendMagicLink: async () => null, signInWith: async () => undefined, providers: [], startDemo: () => undefined };

test('testDemoUrl', () => {
  expect(isDemoUrl('?demo=1')).toBe(true);
  expect(isDemoUrl('?capture=1&demo')).toBe(true);
  expect(isDemoUrl('')).toBe(false);
  expect(isDemoUrl('?capture=1')).toBe(false);
});

/**
 * The demo is a whole app to try: a personal group, a domain group, a shared group with other people and a list
 * group, with activities of every shape around today. Everything stays in this page's memory.
 */
test('testDemoSessionHasSampleGroupsAndActivities', async () => {
  const s = openDemoSession();
  expect(s.demo).toBe(true);
  expect(s.account).toBe(DEMO_ACCOUNT);
  const groups = await s.primary.listGroups();
  expect(groups.map(g => g.kind).sort()).toEqual(['domain', 'invite', 'invite', 'personal']);
  const list = groups.find(g => g.type === 'list')!;
  const shared = groups.find(g => g.kind === 'invite' && g.type !== 'list')!;
  expect(Object.keys(shared.members).length).toBeGreaterThan(1);
  const { activity: shopping } = await s.primary.getActivity(listActivityId(list));
  expect(shopping.checklist!.items.length).toBeGreaterThan(2);
  const all = (await Promise.all(groups.map(g => s.primary.listActivities(g.id)))).flat();
  expect(all.some(a => a.props.due === today())).toBe(true);
  expect(all.some(a => a.props.schedule !== undefined && a.props.repeat !== undefined)).toBe(true);
  expect(all.some(a => a.props.assignment?.assignee === DEMO_ACCOUNT && a.props.assignment.state === 'proposed')).toBe(true);
  expect(all.some(a => a.props.waitingFor !== undefined)).toBe(true);
  expect((await s.primary.listActivities(null)).length).toBeGreaterThan(0);
});

/** Two demos never share data: each opening starts clean. */
test('testEachDemoStartsClean', async () => {
  const one = openDemoSession();
  const two = openDemoSession();
  const g = (await one.primary.listGroups()).find(x => x.kind === 'personal')!;
  await one.primary.saveGroup({ ...g, name: 'cambiato' }, g.version);
  expect((await two.primary.listGroups()).find(x => x.kind === 'personal')!.name).not.toBe('cambiato');
});

/** What the demo leaves in the browser (shortcuts, pinned groups) is wiped when a demo starts. */
test('testDemoWipesItsOwnBrowserPrefs', () => {
  localStorage.setItem(`attivita:pins:${DEMO_ACCOUNT}`, '[]');
  localStorage.setItem(`attivita:pins:${PIPPO}`, '[]');
  openDemoSession();
  expect(localStorage.getItem(`attivita:pins:${DEMO_ACCOUNT}`)).toBeNull();
  expect(localStorage.getItem(`attivita:pins:${PIPPO}`)).toBe('[]');
});

/** In the demo a band says nothing is saved, with the way out. */
test('testDemoBandAndWayOut', async () => {
  const s = openDemoSession();
  const leave = vi.fn(async () => undefined);
  render(<App open={async () => ({ ...s, signOut: leave })} login={login} />);
  const band = await screen.findByRole('region', { name: 'Modalità demo' });
  expect(within(band).getByText('Modalità demo: niente viene salvato')).toBeTruthy();
  fireEvent.click(within(band).getByRole('button', { name: 'Esci dalla demo' }));
  expect(leave).toHaveBeenCalled();
});

test('testNoBandOutsideTheDemo', async () => {
  render(<App open={async () => memorySession(PIPPO)} login={login} />);
  await screen.findByRole('navigation', { name: 'Sezioni' });
  expect(screen.queryByRole('region', { name: 'Modalità demo' })).toBeNull();
});

/** From the sign-in page, without an account. */
test('testLoginOffersTheDemo', () => {
  const startDemo = vi.fn();
  render(<LoginScreen actions={{ ...login, startDemo }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Prova con dati di esempio' }));
  expect(startDemo).toHaveBeenCalled();
});

/** From the settings: try the demo from an account; inside the demo, leave it instead of the account. */
test('testSettingsDemoButtons', () => {
  const real = memorySession(PIPPO);
  const { unmount } = renderWithSession(<SettingsView />, real);
  expect(screen.getByRole('button', { name: 'Prova con dati di esempio' })).toBeTruthy();
  unmount();
  renderWithSession(<SettingsView />, openDemoSession());
  expect(screen.queryByRole('button', { name: 'Prova con dati di esempio' })).toBeNull();
  expect(screen.queryByRole('button', { name: "Esci dall'account" })).toBeNull();
  expect(screen.getByRole('button', { name: 'Esci dalla demo' })).toBeTruthy();
});

/** A group on Google would need a real Google account: in the demo new groups stay in memory. */
test('testDemoNewGroupHasNoGoogleChoice', async () => {
  renderWithSession(<GroupsView />, openDemoSession());
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo gruppo condiviso' }));
  expect(screen.queryByText('Gestione privata')).toBeNull();
});
