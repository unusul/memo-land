import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { addItem, removeItem } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { GroupPage } from '../src/groups/GroupPage.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { memorySession, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());

async function openDetail(id: string, title: string, s = memorySession()) {
  renderWithSession(<ActivityDetail activityId={id} onClose={() => undefined} />, s);
  await screen.findByDisplayValue(title);
  return s;
}

/** As a phone keyboard does it: the form is submitted, no Enter key event (it arrives as "Unidentified" there). */
function addVoice(text: string) {
  const input = screen.getByLabelText('Nuova voce');
  userType(input, text);
  fireEvent.submit(input.closest('form')!);
}

test('testAddItemsAndTickThem', async () => {
  const s = await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  addVoice('latte');
  await screen.findByRole('checkbox', { name: 'latte' });
  addVoice('pane');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'pane' }));
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.checklist?.items)
    .toEqual([expect.objectContaining({ text: 'latte', done: false }), expect.objectContaining({ text: 'pane', done: true })]));
});

test('testSuggestionsFromTheListHistory', async () => {
  const s = memorySession();
  let { activity } = await s.primary.getActivity('idea');
  for (const t of ['latte', 'lardo', 'latte']) {
    activity = addItem(activity, t, 'pippo@altereos.com', '2026-11-11T08:00:00Z');
    activity = removeItem(activity, activity.checklist!.items.at(-1)!.id, 'pippo@altereos.com', '2026-11-11T08:00:00Z');
  }
  await s.primary.saveActivity(activity, activity.version);
  await openDetail('idea', 'app gestione core', s);
  userType(screen.getByLabelText('Nuova voce'), 'la');
  const suggestions = screen.getByRole('list', { name: 'Suggerimenti' });
  expect(within(suggestions).getAllByRole('button').map(b => b.textContent)).toEqual(['latte', 'lardo']);
  fireEvent.click(within(suggestions).getByRole('button', { name: 'latte' }));
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.checklist?.items.map(i => i.text)).toEqual(['latte']));
});

test('testFixedSwitchOnlyOnRepeatingActivities', async () => {
  const s = await openDetail('backup', 'Controllo backup');
  userClick('+ Lista');
  addVoice('verifica log');
  fireEvent.click(await screen.findByRole('checkbox', { name: /Lista fissa/ }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.checklist?.fixed).toBe(true));
});

test('testNoFixedSwitchOnOneOffActivities', async () => {
  await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  addVoice('latte');
  await screen.findByRole('checkbox', { name: 'latte' });
  expect(screen.queryByRole('checkbox', { name: /Lista fissa/ })).toBeNull();
});

test('testGroupListShowsActivitiesWithoutDates', async () => {
  const opened: string[] = [];
  renderWithSession(<GroupPage groupId="domain:altereos.com" onOpen={t => opened.push(t.activityId)} />, memorySession());
  const list = await screen.findByRole('region', { name: 'Elenco di altereos.com' });
  expect(within(list).getByText('Controllo backup')).toBeTruthy();
  expect(within(list).getByText('Aggiornare la documentazione')).toBeTruthy();
  expect(within(list).getByRole('heading', { name: /in attesa/i })).toBeTruthy();
  fireEvent.click(within(list).getByText('Controllo backup'));
  expect(opened).toEqual(['backup']);
});

test('testGroupsPageOpensTheGroup', async () => {
  const opened: string[] = [];
  renderWithSession(<GroupsView onOpenGroup={id => opened.push(id)} />, memorySession());
  fireEvent.click(await screen.findByRole('button', { name: 'Elenco di altereos.com' }));
  expect(opened).toEqual(['domain:altereos.com']);
});

/**
 * Found on a phone: a new item was added only on an Enter keydown, which phone keyboards send as "Unidentified" while
 * a word is being composed, so nothing happened. The field is a form now: the keyboard's return key submits it.
 */
test('testReturnKeyOnAPhoneKeyboardAddsTheItem', async () => {
  const s = await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  const input = screen.getByLabelText('Nuova voce') as HTMLInputElement;
  userType(input, 'uova');
  fireEvent.keyDown(input, { key: 'Unidentified' });
  fireEvent.submit(input.closest('form')!);
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.checklist?.items.map(i => i.text)).toEqual(['uova']));
  expect(input.value).toBe('');
  expect(input.getAttribute('enterkeyhint')).toBe('enter');
});

const listBox = () => within(screen.getByRole('region', { name: 'Lista' }));
const ticks = () => listBox().getAllByRole('checkbox').map(c => c.getAttribute('aria-label'));

/**
 * A ticked item goes under a closed row «N voci spuntate», as in a notes app; ticking another does not open it, the
 * count grows. Before, ticked items stayed visible at the bottom, struck through.
 */
test('testTickedItemsGoUnderAClosedRow', async () => {
  await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  for (const t of ['latte', 'pane', 'uova']) { addVoice(t); await screen.findByRole('checkbox', { name: t }); }
  expect(listBox().queryByRole('button', { name: /spuntat/ })).toBeNull();
  fireEvent.click(screen.getByRole('checkbox', { name: 'latte' }));
  const row = await listBox().findByRole('button', { name: '1 voce spuntata' });
  expect(row.getAttribute('aria-expanded')).toBe('false');
  expect(ticks()).toEqual(['pane', 'uova']);
  fireEvent.click(screen.getByRole('checkbox', { name: 'pane' }));
  await listBox().findByRole('button', { name: '2 voci spuntate' });
  expect(ticks()).toEqual(['uova']);
});

/** Opened, the row shows the ticked items struck through; unticking one brings it back among those to do. */
test('testOpenTickedRowAndUntick', async () => {
  const s = await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  for (const t of ['latte', 'pane']) { addVoice(t); await screen.findByRole('checkbox', { name: t }); }
  fireEvent.click(screen.getByRole('checkbox', { name: 'latte' }));
  fireEvent.click(await listBox().findByRole('button', { name: '1 voce spuntata' }));
  expect(listBox().getByRole('button', { name: '1 voce spuntata' }).getAttribute('aria-expanded')).toBe('true');
  expect(ticks()).toEqual(['pane', 'latte']);
  expect(screen.getByRole('checkbox', { name: 'latte' }).closest('li')!.classList.contains('done')).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'latte' }));
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.checklist?.items.every(i => !i.done)).toBe(true));
  await waitFor(() => expect(ticks()).toEqual(['latte', 'pane']));
  expect(listBox().queryByRole('button', { name: /spuntat/ })).toBeNull();
});

/** The field for a new item sits right under the items to do, the ticked row below it, as in a notes app. */
test('testNewItemFieldBeforeTheTickedRow', async () => {
  await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  for (const t of ['latte', 'pane']) { addVoice(t); await screen.findByRole('checkbox', { name: t }); }
  fireEvent.click(screen.getByRole('checkbox', { name: 'latte' }));
  const row = await listBox().findByRole('button', { name: '1 voce spuntata' });
  const field = screen.getByLabelText('Nuova voce');
  expect(field.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

/**
 * The + beside the field adds the item too, besides the keyboard's return key (taken away on 2026-11-12, asked back
 * on 2026-11-13). It keeps the focus in the field, so the phone keyboard stays open for the next item.
 */
test('testPlusButtonAddsTheItem', async () => {
  const s = await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  const input = screen.getByLabelText('Nuova voce') as HTMLInputElement;
  const plus = screen.getByRole('button', { name: 'Aggiungi la voce' }) as HTMLButtonElement;
  expect(plus.disabled).toBe(true);
  userType(input, 'uova');
  const down = fireEvent.pointerDown(plus);
  expect(down).toBe(false);
  fireEvent.click(plus);
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.checklist?.items.map(i => i.text)).toEqual(['uova']));
  expect(input.value).toBe('');
});
