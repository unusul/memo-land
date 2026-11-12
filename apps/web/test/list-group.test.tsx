import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { addItem, newActivity, toggleItem } from '@attivita/core';
import type { Group } from '@attivita/core';
import { GroupsView } from '../src/groups/GroupsView.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

const T = '2026-11-02T08:00:00Z';
const spesa: Group = { id: 'inv:spesa', kind: 'invite', type: 'list', name: 'spesa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner', [PLUTO]: 'member' }, version: 1 };
beforeEach(() => localStorage.clear());

async function withSpesa(items: string[] = [], ticked = 0) {
  const backend = benchBackend();
  backend.groups.set(spesa.id, structuredClone(spesa));
  if (items.length) {
    let a = newActivity({ id: 'inv:spesa#list', accountId: PIPPO, title: 'spesa', groupId: spesa.id }, T);
    for (const t of items) a = addItem(a, t, PIPPO, T);
    for (const i of a.checklist!.items.slice(0, ticked)) a = toggleItem(a, i.id, PIPPO, T);
    backend.activities.set(a.id, a);
  }
  return memorySession(PIPPO, {}, backend);
}

const nav = () => screen.findByRole('navigation', { name: 'Sezioni' });

/** A list group opens straight on its list; the first item creates the list's activity. */
test('testListGroupOpensItsListDirectly', async () => {
  const s = await withSpesa();
  renderWithSession(<Shell />, s);
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^spesa/ }));
  const input = await screen.findByPlaceholderText('Aggiungi una voce…');
  expect(screen.queryByRole('region', { name: 'Elenco di spesa' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Nuova attività in spesa' })).toBeNull();
  userType(input, 'latte');
  fireEvent.submit(input.closest('form')!);
  await waitFor(async () => expect((await s.primary.getActivity('inv:spesa#list')).activity.checklist?.items.map(i => i.text)).toEqual(['latte']));
});

/**
 * The list is a whole activity: its properties are there too (a due date, who does it, a repeat that starts the list
 * again). What would take it out of the group is not: it is the group's list.
 */
test('testListGroupShowsTheListsActivityWithItsProperties', async () => {
  const s = await withSpesa(['latte']);
  renderWithSession(<Shell />, s);
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^spesa/ }));
  await screen.findByText('latte');
  for (const chip of ['+ Scadenza', '+ Assegna', '+ Ripeti']) expect(screen.getByRole('button', { name: chip })).toBeTruthy();
  for (const gone of ['Archivia', 'Torna bozza', 'Modifica Dove', 'Chiudi']) expect(screen.queryByRole('button', { name: gone })).toBeNull();
  expect(screen.queryByLabelText('Titolo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: '+ Scadenza' }));
  userType(screen.getByLabelText('Scadenza'), '2026-11-14');
  fireEvent.click(screen.getByRole('button', { name: 'Aggiungi' }));
  await waitFor(async () => expect((await s.primary.getActivity('inv:spesa#list')).activity.props.due).toBe('2026-11-14'));
});

/** In the menu a list group counts what is still to tick. */
test('testListGroupCountsWhatIsLeftToTick', async () => {
  renderWithSession(<Shell />, await withSpesa(['latte', 'pane', 'uova'], 1));
  expect(await within(await nav()).findByRole('button', { name: 'spesa, 2 da spuntare' })).toBeTruthy();
});

test('testNewGroupCanBeAList', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<GroupsView />, s);
  await screen.findByRole('article', { name: 'developers' });
  userClick('Nuovo gruppo condiviso');
  fireEvent.click(within(screen.getByRole('group', { name: 'Tipo' })).getByRole('radio', { name: 'Lista' }));
  userType(screen.getByLabelText('Nome'), 'ferramenta');
  userClick('Crea');
  await waitFor(async () => expect((await s.primary.listGroups()).find(g => g.name === 'ferramenta')?.type).toBe('list'));
});

/** The owner changes the type afterwards; members do not (the engines allow it to the owner only). */
test('testOnlyTheOwnerChangesTheType', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<GroupsView />, s);
  const card = await screen.findByRole('article', { name: 'developers' });
  fireEvent.click(within(within(card).getByRole('radiogroup', { name: 'Tipo di developers' })).getByRole('radio', { name: 'Lista' }));
  await waitFor(async () => expect((await s.primary.getGroup('inv:developers')).type).toBe('list'));
  renderWithSession(<GroupsView />, memorySession(PLUTO));
  await waitFor(() => expect(screen.getAllByRole('article', { name: 'developers' })).toHaveLength(2));
  expect(within(screen.getAllByRole('article', { name: 'developers' }).at(-1)!).queryByRole('radiogroup')).toBeNull();
});

/** Turning a group of activities into a list hides them, and the page says how to see them again. */
test('testListPageMentionsTheActivitiesItHides', async () => {
  const backend = benchBackend();
  backend.groups.set('inv:developers', { ...backend.groups.get('inv:developers')!, type: 'list' });
  renderWithSession(<Shell />, memorySession(PIPPO, {}, backend));
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^developers/ }));
  expect(await screen.findByText(/1 attività che nella lista non si vede/)).toBeTruthy();
});

/** The list group's page already says the group: no Forma (always "idea" for a list) and no Dove. */
test('testListPageHasNoFormaAndNoDove', async () => {
  renderWithSession(<Shell />, await withSpesa(['latte']));
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^spesa/ }));
  await screen.findByText('latte');
  expect(screen.queryByText('Forma')).toBeNull();
  expect(screen.queryByText('Dove')).toBeNull();
});

/** On a list the button says what it does: complete it, or complete it and start again when it repeats. */
test('testListCompleteButtonSaysWhatItDoes', async () => {
  const s = await withSpesa(['latte']);
  const first = renderWithSession(<Shell />, s);
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^spesa/ }));
  await screen.findByText('latte');
  expect(screen.getByRole('button', { name: 'Completa la lista' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Fatto' })).toBeNull();
  first.unmount();
  const list = (await s.primary.getActivity('inv:spesa#list')).activity;
  await s.primary.saveActivity({ ...list, props: { due: '2026-11-14', repeat: { mode: 'fromCompletion', every: { unit: 'week', count: 1 } } } }, list.version);
  renderWithSession(<Shell />, s);
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^spesa/ }));
  expect(await screen.findByRole('button', { name: 'Completa e ricomincia' })).toBeTruthy();
});
