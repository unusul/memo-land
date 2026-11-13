import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { GroupsView } from '../src/groups/GroupsView.js';
import { setPins } from '../src/groups/barPrefs.js';
import { PIPPO, groupRow, manage, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());
// Unmounts first, then leaves time to the test's history entries to be taken back (see back.test.tsx).
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 50)); });

/**
 * One row per group: its name, what it is and how many people, and the count of what is open. Tapping the row opens the
 * group. Before, a tall card held every button, and the way in was a count icon nobody read as "open".
 */
test('testRowOpensTheGroupAndSaysWhatItIs', async () => {
  const opened: string[] = [];
  renderWithSession(<GroupsView onOpenGroup={id => opened.push(id)} />, memorySession(PIPPO));
  const row = await groupRow('developers');
  expect(row.getAttribute('aria-label')).toBe('Apri developers, 1 aperta');
  expect(within(row).getByText('su invito · 3 persone')).toBeTruthy();
  expect(within(row).getByText('1')).toBeTruthy();
  expect(within(await groupRow('altereos.com')).getByText('dominio · 2 persone')).toBeTruthy();
  fireEvent.click(row);
  expect(opened).toEqual(['inv:developers']);
  expect(screen.queryByRole('button', { name: /Invita|Esci da|Nuova attività in/ })).toBeNull();
});

/** ⋯ opens the group's page with what was on the card; Indietro goes back to the rows. */
test('testMoreOpensTheGroupsPage', async () => {
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  const page = await manage('developers');
  for (const name of ['Invita in developers', 'Archivia developers', 'Metti developers in barra', 'Icona di developers']) {
    expect(within(page).getByRole('button', { name })).toBeTruthy();
  }
  expect(within(page).getByRole('radiogroup', { name: 'Tipo di developers' })).toBeTruthy();
  expect(within(page).getByText('tu: proprietario')).toBeTruthy();
  expect(within(page).getAllByRole('listitem').map(li => li.textContent)).toEqual(['tuproprietario', 'plutomembro', 'ospiteospite']);
  userClick('Indietro');
  expect(await groupRow('developers')).toBeTruthy();
  expect(within(await manage('altereos.com')).getByRole('button', { name: 'Esci da altereos.com' })).toBeTruthy();
});

/** The phone's back from a group's page goes back to the rows of Noi. */
test('testPhoneBackFromTheGroupsPage', async () => {
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  await manage('developers');
  await new Promise(r => setTimeout(r, 10));
  window.history.back();
  expect(await groupRow('developers')).toBeTruthy();
});

/** With something in the bar, two titled blocks: In barra first, in the bar's order, then the others. */
test('testSectionsWhenSomethingIsPinned', async () => {
  const rows = () => screen.getAllByRole('button', { name: /^Apri / }).map(b => b.getAttribute('aria-label')!.slice(5).split(',')[0]);
  const view = renderWithSession(<GroupsView />, memorySession(PIPPO));
  await groupRow('developers');
  expect(screen.queryByText('In barra')).toBeNull();
  view.unmount();
  setPins(PIPPO, ['inv:developers']);
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  await groupRow('developers');
  expect(within(screen.getByRole('list', { name: 'In barra' })).getAllByRole('button', { name: /^Apri / })).toHaveLength(1);
  expect(screen.getByText('Altri gruppi')).toBeTruthy();
  expect(rows()).toEqual(['developers', 'altereos.com']);
});

test('testNewSharedGroupOnTheCentralEngine', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<GroupsView />, s);
  await groupRow('developers');
  userClick('Nuovo gruppo');
  expect((screen.getByRole('radio', { name: 'Gestito da terzi' }) as HTMLInputElement).checked).toBe(true);
  userType(screen.getByLabelText('Nome'), 'famiglia');
  userClick('Crea');
  await waitFor(async () => expect((await s.primary.listGroups()).map(g => g.name)).toContain('famiglia'));
});

/** On Google the group is made by the wizard, which gets the name already written. */
test('testNewSharedGroupOnGoogleOpensTheWizardWithTheName', async () => {
  renderWithSession(<GroupsView />, memorySession(PIPPO));
  await groupRow('developers');
  userClick('Nuovo gruppo');
  fireEvent.click(screen.getByRole('radio', { name: 'Gestione privata' }));
  userType(screen.getByLabelText('Nome'), 'calcetto');
  userClick('Continua su Google');
  const wizard = screen.getByRole('region', { name: 'Nuovo gruppo su Google' });
  expect(wizard).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Nuovo gruppo' })).toBeNull();
});
