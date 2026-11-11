import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { GroupsView } from '../src/groups/GroupsView.js';
import { setPins } from '../src/groups/barPrefs.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());

/** The card's buttons are icons, named for screen readers; the list keeps its count beside the icon. */
test('testCardButtonsAreIcons', async () => {
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  const card = await screen.findByRole('article', { name: 'developers' });
  expect(within(card).getByRole('button', { name: 'Elenco di developers' }).textContent).toBe('1');
  for (const name of ['Invita in developers', 'Nuova attività in developers']) expect(within(card).getByRole('button', { name }).textContent).toBe('');
  const domain = screen.getByRole('article', { name: 'altereos.com' });
  expect(within(domain).getByRole('button', { name: 'Esci da altereos.com' }).textContent).toBe('');
});

/** The pin says which groups are in the bar: no section titles. */
test('testNoSectionTitlesPinnedFirst', async () => {
  setPins(PIPPO, ['inv:developers']);
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  await screen.findByRole('article', { name: 'developers' });
  expect(screen.queryByRole('heading', { name: 'In barra' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Altri gruppi' })).toBeNull();
  expect(screen.getAllByRole('article').map(a => a.getAttribute('aria-label'))).toEqual(['developers', 'altereos.com']);
});

test('testPlusOnTheCardOpensANewActivityOfThatGroup', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  fireEvent.click(within(await screen.findByRole('navigation', { name: 'Sezioni' })).getByRole('button', { name: 'Noi' }));
  userClick('Nuova attività in developers');
  const d = await screen.findByRole('article', { name: 'Nuova attività' });
  expect(within(d).getByText(/^developers/)).toBeTruthy();
});

test('testNewSharedGroupOnTheCentralEngine', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<GroupsView />, s);
  await screen.findByRole('article', { name: 'developers' });
  userClick('Nuovo gruppo condiviso');
  expect((screen.getByRole('radio', { name: 'Gestito da terzi' }) as HTMLInputElement).checked).toBe(true);
  userType(screen.getByLabelText('Nome'), 'famiglia');
  userClick('Crea');
  await waitFor(async () => expect((await s.primary.listGroups()).map(g => g.name)).toContain('famiglia'));
});

/** On Google the group is made by the wizard, which gets the name already written. */
test('testNewSharedGroupOnGoogleOpensTheWizardWithTheName', async () => {
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  await screen.findByRole('article', { name: 'developers' });
  userClick('Nuovo gruppo condiviso');
  fireEvent.click(screen.getByRole('radio', { name: 'Gestione privata' }));
  userType(screen.getByLabelText('Nome'), 'calcetto');
  userClick('Continua su Google');
  const wizard = screen.getByRole('region', { name: 'Nuovo gruppo su Google' });
  expect(wizard).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Nuovo gruppo condiviso' })).toBeNull();
});
