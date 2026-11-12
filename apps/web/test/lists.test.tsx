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
 * a word is being composed, so nothing happened. The field is a form now, and the + button adds without a keyboard.
 */
test('testPlusButtonAddsTheItem', async () => {
  const s = await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  userType(screen.getByLabelText('Nuova voce'), 'uova');
  fireEvent.keyDown(screen.getByLabelText('Nuova voce'), { key: 'Unidentified' });
  userClick('Aggiungi la voce');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.checklist?.items.map(i => i.text)).toEqual(['uova']));
  expect((screen.getByLabelText('Nuova voce') as HTMLInputElement).value).toBe('');
});

/** A ticked item sinks to the bottom, struck through, as before the form. */
test('testTickedItemSinksToTheBottom', async () => {
  await openDetail('idea', 'app gestione core');
  userClick('+ Lista');
  addVoice('latte');
  await screen.findByRole('checkbox', { name: 'latte' });
  addVoice('pane');
  fireEvent.click(await screen.findByRole('checkbox', { name: 'latte' }));
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Lista' })).getAllByRole('checkbox').map(c => c.getAttribute('aria-label'))).toEqual(['pane', 'latte']));
  expect(screen.getByRole('checkbox', { name: 'latte' }).closest('li')!.classList.contains('done')).toBe(true);
});
