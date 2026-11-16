import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { addItem, newActivity } from '@attivita/core';
import type { Activity } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => localStorage.clear());
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 50)); });

const T0 = '2026-11-01T08:00:00Z';

/** A shopping list with «latte» and «pane», in the domain group (pippo and pluto) unless told otherwise. */
function withList(groupId: string, assignable = true) {
  const backend = benchBackend();
  const a: Activity = addItem(addItem(newActivity({ id: 'spesa', accountId: PIPPO, title: 'Spesa', groupId }, T0), 'latte', PIPPO, T0), 'pane', PIPPO, T0);
  a.checklist = { ...a.checklist!, assignable };
  backend.activities.set('spesa', a);
  const s = memorySession(PIPPO, {}, backend);
  renderWithSession(<ActivityDetail activityId="spesa" onClose={() => undefined} />, s);
  return s;
}
const rowOf = (text: string) => screen.getByRole('checkbox', { name: text }).closest('li') as HTMLElement;
const itemsOf = async (s: ReturnType<typeof memorySession>) => (await s.primary.getActivity('spesa')).activity.checklist?.items;
const picker = (text: string) => screen.getByRole('button', { name: `Assegna ${text}` });
const menuOf = (text: string) => screen.getByRole('listbox', { name: `A chi va ${text}` });
/** Opens the item's menu, reads its choices, and closes it again. */
const optionsOf = (text: string) => {
  fireEvent.click(picker(text));
  const names = within(menuOf(text)).getAllByRole('option').map(o => o.textContent);
  fireEvent.click(picker(text));
  return names;
};
const choose = (text: string, name: string) => {
  fireEvent.click(picker(text));
  fireEvent.click(within(menuOf(text)).getByRole('option', { name }));
};

/**
 * Who has an item is chosen inline, in its row, from a small menu under the person icon (user's choice, 2026-11-16: a
 * row of buttons under the item made no sense for a handful of names, and the browser's drop-down looked out of place).
 */
test('testAssignFromTheInlineMenu', async () => {
  const s = withList('domain:altereos.com');
  await screen.findByRole('checkbox', { name: 'latte' });
  expect(optionsOf('latte')).toEqual(['nessuno', 'tu', 'pluto']);
  choose('latte', 'pluto');
  await waitFor(async () => expect((await itemsOf(s))?.[0]).toMatchObject({ text: 'latte', assignee: PLUTO }));
  expect(screen.queryByRole('listbox')).toBeNull();
  await waitFor(() => expect(picker('latte').textContent).toBe('pluto'));
  choose('latte', 'nessuno');
  await waitFor(async () => expect((await itemsOf(s))?.[0]).not.toHaveProperty('assignee'));
});

/** Towards the left the row's menu opens; the × still takes the item away. */
test('testSwipeLeftOpensTheMenu', async () => {
  const s = withList('domain:altereos.com');
  const row = (await screen.findByRole('checkbox', { name: 'pane' })).closest('.swipe')!;
  fireEvent.pointerDown(row, { clientX: 300, clientY: 300, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerMove(row, { clientX: 225, clientY: 300, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerMove(row, { clientX: 150, clientY: 300, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(row, { clientX: 150, clientY: 300, pointerId: 1, pointerType: 'touch' });
  expect(menuOf('pane')).toBeTruthy();
  // A finger's tap on the ×: press, then click; the swipe left no click to swallow it.
  const cross = screen.getByRole('button', { name: 'Togli pane' });
  fireEvent.pointerDown(cross, { clientX: 300, clientY: 300, pointerId: 2, pointerType: 'touch' });
  fireEvent.pointerUp(cross, { clientX: 300, clientY: 300, pointerId: 2, pointerType: 'touch' });
  fireEvent.click(cross);
  await waitFor(async () => expect((await itemsOf(s))?.map(i => i.text)).toEqual(['latte']));
});

/** «Altro nome…» turns the menu into a field; the name typed comes back in the menu of every item of the list. */
async function typeOtherName(item: string, name: string) {
  await waitFor(() => expect(picker(item)).toBeTruthy());
  fireEvent.click(picker(item));
  fireEvent.click(screen.getByRole('button', { name: 'Altro nome…' }));
  const field = screen.getByLabelText(`Altro nome per ${item}`);
  fireEvent.change(field, { target: { value: name } });
  fireEvent.submit(field.closest('form')!);
}

test('testAssignToANameOutsideTheGroup', async () => {
  const s = withList('domain:altereos.com');
  await screen.findByRole('checkbox', { name: 'latte' });
  await typeOtherName('latte', ' nonna ');
  await waitFor(async () => expect((await itemsOf(s))?.[0]).toMatchObject({ assignee: 'nonna' }));
  await waitFor(() => expect(within(rowOf('latte')).getByText('nonna')).toBeTruthy());
  expect(optionsOf('pane')).toEqual(['nessuno', 'tu', 'pluto', 'nonna']);
});

/** A typed name that is already a choice is that choice: «nessuno» is nobody, «Pluto» the member, «tu» the person. */
test('testTypedNamesThatAreChoicesAreNotNewNames', async () => {
  const s = withList('domain:altereos.com');
  await screen.findByRole('checkbox', { name: 'latte' });
  await typeOtherName('latte', 'Pluto');
  await waitFor(async () => expect((await itemsOf(s))?.[0]).toMatchObject({ assignee: PLUTO }));
  await typeOtherName('pane', 'TU');
  await waitFor(async () => expect((await itemsOf(s))?.[1]).toMatchObject({ assignee: PIPPO }));
  await typeOtherName('latte', 'nessuno');
  await waitFor(async () => expect((await itemsOf(s))?.[0]).not.toHaveProperty('assignee'));
  expect(optionsOf('latte')).toEqual(['nessuno', 'tu', 'pluto']);
});

/** A tap outside the menu closes it, choosing nothing. */
test('testATapOutsideClosesTheMenu', async () => {
  withList('domain:altereos.com');
  await screen.findByRole('checkbox', { name: 'latte' });
  fireEvent.click(picker('latte'));
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('listbox')).toBeNull();
});

/** A list starts not assignable (user's choice, 2026-11-16): no menu, and towards the left still takes away. */
test('testAssignableIsOffUntilSwitchedOn', async () => {
  const s = withList('domain:altereos.com', false);
  const box = await screen.findByRole('switch', { name: 'Voci assegnabili' });
  expect(box.getAttribute('aria-checked')).toBe('false');
  expect(screen.queryByRole('button', { name: 'Assegna latte' })).toBeNull();
  fireEvent.click(box);
  await waitFor(async () => expect((await s.primary.getActivity('spesa')).activity.checklist?.assignable).toBe(true));
  expect(await screen.findByRole('button', { name: 'Assegna latte' })).toBeTruthy();
});

/** In the personal group everything is the person's: no menu, no switch. */
test('testPersonalListHasNoAssign', async () => {
  withList(`personal:${PIPPO}`);
  await screen.findByRole('checkbox', { name: 'latte' });
  expect(screen.queryByRole('button', { name: 'Assegna latte' })).toBeNull();
  expect(screen.queryByRole('switch', { name: 'Voci assegnabili' })).toBeNull();
});
