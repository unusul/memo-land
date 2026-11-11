import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Shell } from '../src/shell/Shell.js';
import { noteChoice } from '../src/usage/choicesStore.js';
import { PIPPO, PLUTO, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
});
afterEach(() => vi.useRealTimers());

const nav = () => screen.findByRole('navigation', { name: 'Sezioni' });
const names = (el: HTMLElement) => within(el).getAllByRole('button').map(b => b.getAttribute('aria-label') ?? b.textContent);

test('testMenuIsGroupsThenDraftsThenMe', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  const n = await nav();
  await within(n).findByRole('button', { name: /^altereos\.com/ });
  expect(names(n)).toEqual(['Gruppi', 'Idee personali', 'altereos.com, 3 aperte', 'developers, 1 aperta', 'Bozze, 1 da vedere', 'Io']);
});

/** The agenda left the menu: the date header is now its entry, and it says what waits for the person. */
test('testHeaderIsTheAgendaAndSaysWhatWaits', async () => {
  renderWithSession(<Shell />, memorySession(PLUTO));
  const header = await screen.findByRole('button', { name: /^Agenda/ });
  // The capital initial comes from CSS (::first-letter).
  expect(header.textContent).toMatch(/mercoledì 11 novembre/);
  expect(header.textContent).toMatch(/1 scaduta · 1 proposta/);
  expect(header.getAttribute('aria-current')).toBe('page');
  fireEvent.click(within(await nav()).getByRole('button', { name: 'Io' }));
  expect(header.getAttribute('aria-current')).toBeNull();
  fireEvent.click(header);
  expect(await screen.findAllByText('Analisi costi')).toHaveLength(2);
});

test('testGroupShortcutOpensItsList', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^altereos\.com/ }));
  const list = await screen.findByRole('region', { name: 'Elenco di altereos.com' });
  expect(within(list).getByText('Controllo backup')).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'altereos.com' })).toBeTruthy();
});

test('testMostUsedGroupsComeFirstAfterPersonalAndAtMostFive', async () => {
  for (let i = 0; i < 3; i++) noteChoice(PIPPO, 'group', 'inv:developers');
  noteChoice(PIPPO, 'group', 'domain:altereos.com');
  const s = memorySession(PIPPO);
  for (const n of ['a', 'b', 'c', 'd']) {
    await s.primary.saveGroup({ id: `inv:${n}`, kind: 'invite', name: `gruppo ${n}`, ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 }, null);
  }
  renderWithSession(<Shell />, s);
  const n = await nav();
  await within(n).findByRole('button', { name: /^gruppo a/ });
  const groups = names(n).slice(1, -2).map(x => x!.split(',')[0]);
  expect(groups).toEqual(['Idee personali', 'developers', 'altereos.com', 'gruppo a', 'gruppo b']);
});
