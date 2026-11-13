import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { Shell } from '../src/shell/Shell.js';
import { SwipeRow } from '../src/shell/SwipeRow.js';
import { ToastHost } from '../src/shell/toast.js';
import { PIPPO, groupRow, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
});
// Unmounts first, then leaves time to the test's history entries to be taken back (see back.test.tsx).
afterEach(async () => { vi.useRealTimers(); cleanup(); await new Promise(r => setTimeout(r, 50)); });

/** A finger from (x, y) moved by (dx, dy) and lifted; the browser's click after it, as a real tap would give. */
function swipe(el: Element, dx: number, dy = 0, x = 300, y = 300) {
  fireEvent.pointerDown(el, { clientX: x, clientY: y, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerMove(el, { clientX: x + dx / 2, clientY: y + dy / 2, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerMove(el, { clientX: x + dx, clientY: y + dy, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(el, { clientX: x + dx, clientY: y + dy, pointerId: 1, pointerType: 'touch' });
  fireEvent.click(el);
}
const swipeRowOf = (el: Element) => el.closest('.swipe')!;

/**
 * Past the threshold the action runs; short or vertical moves run nothing. A drag sideways is not a tap, so it does not
 * also click; a vertical move (a scroll) leaves the click to the browser.
 */
test('testSwipeRowRunsPastTheThresholdOnly', () => {
  const right = vi.fn(), left = vi.fn(), clicked = vi.fn();
  render(<SwipeRow right={{ label: 'Fatto', icon: 'check', tone: 'done', run: right }} left={{ label: 'Rimanda', icon: 'deadline', tone: 'later', run: left }}>
    <button onClick={clicked}>riga</button>
  </SwipeRow>);
  const row = screen.getByRole('button', { name: 'riga' });
  swipe(row, 40);
  swipe(row, 5, 120);
  expect(right).not.toHaveBeenCalled();
  expect(left).not.toHaveBeenCalled();
  swipe(row, 120);
  expect(right).toHaveBeenCalledTimes(1);
  swipe(row, -120);
  expect(left).toHaveBeenCalledTimes(1);
  expect(clicked).toHaveBeenCalledTimes(1);
  fireEvent.click(row);
  expect(clicked).toHaveBeenCalledTimes(2);
});

/** A side without an action does not move: a row that cannot be completed cannot be swiped towards the right. */
test('testSwipeRowWithoutThatAction', () => {
  const left = vi.fn();
  render(<SwipeRow left={{ label: 'Togli', icon: 'trash', tone: 'remove', run: left }}><button>riga</button></SwipeRow>);
  swipe(screen.getByRole('button', { name: 'riga' }), 120);
  expect(left).not.toHaveBeenCalled();
});

/** In the agenda, towards the right is Fatto for that occurrence, with Annulla that puts it back as it was. */
test('testAgendaSwipeRightIsDoneWithUndo', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<Shell />, s);
  const before = (await s.primary.getActivity('backup')).activity.history.length;
  swipe(swipeRowOf((await screen.findAllByText('Controllo backup'))[0]!), 150);
  expect(await screen.findByText('Fatta')).toBeTruthy();
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.history.at(-1)?.kind).toBe('completed'));
  userClick('Annulla');
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.history).toHaveLength(before));
});

/**
 * Towards the left is «Sposta la data»: the activity opens with its date ready to change. Only on one-off activities the
 * person may edit; a series is not moved from one row. (Rimanda was proposed first, but exists for drafts only.)
 */
test('testAgendaSwipeLeftMovesTheDate', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  swipe(swipeRowOf((await screen.findAllByText('Controllo backup'))[0]!), -150);
  expect(screen.queryByRole('heading', { name: 'Controllo backup' })).toBeNull();
  swipe(swipeRowOf((await screen.findAllByText('Aggiornare la documentazione'))[0]!), -150);
  expect(await screen.findByRole('heading', { name: 'Aggiornare la documentazione' })).toBeTruthy();
  expect((screen.getByLabelText('Scadenza') as HTMLInputElement).value).toBe('2026-11-12');
});

/** In a list, towards the right ticks, towards the left takes the item away with Annulla. */
test('testListSwipes', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ToastHost><ActivityDetail activityId="idea" onClose={() => undefined} /></ToastHost>, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('+ Lista');
  for (const t of ['latte', 'pane']) {
    userType(screen.getByLabelText('Nuova voce'), t);
    fireEvent.submit(screen.getByLabelText('Nuova voce').closest('form')!);
    await screen.findByRole('checkbox', { name: t });
  }
  const items = async () => (await s.primary.getActivity('idea')).activity.checklist?.items.map(i => `${i.text}${i.done ? '✓' : ''}`);
  swipe(swipeRowOf(screen.getByRole('checkbox', { name: 'pane' })), 150);
  await waitFor(async () => expect(await items()).toEqual(['latte', 'pane✓']));
  swipe(swipeRowOf(screen.getByRole('checkbox', { name: 'latte' })), -150);
  expect(await screen.findByText('Voce tolta')).toBeTruthy();
  await waitFor(async () => expect(await items()).toEqual(['pane✓']));
  userClick('Annulla');
  await waitFor(async () => expect(await items()).toEqual(['latte', 'pane✓']));
});

/** In Noi, towards the right opens the group, towards the left its management page. */
test('testNoiSwipes', async () => {
  const opened: string[] = [];
  renderWithSession(<GroupsView onOpenGroup={id => opened.push(id)} />, memorySession(PIPPO));
  swipe(swipeRowOf(await groupRow('developers')), 150);
  expect(opened).toEqual(['inv:developers']);
  swipe(swipeRowOf(await groupRow('developers')), -150);
  expect(await screen.findByRole('article', { name: 'developers' })).toBeTruthy();
});

/**
 * Swiping the page moves between the sections in the bar's order (agenda, Noi, the groups, Io), only from an empty
 * spot and away from the screen's edges, where Android has its own back gesture.
 */
test('testSectionSwipeFromAnEmptySpotOnly', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  const nav = await screen.findByRole('navigation', { name: 'Sezioni' });
  await screen.findAllByText('Controllo backup');
  const page = document.querySelector('main.content')!;
  const noi = () => within(nav).getByRole('button', { name: 'Noi' }).getAttribute('aria-current');
  swipe(page, -200, 0, 12);
  expect(noi()).toBeNull();
  swipe(screen.getAllByText('Controllo backup')[0]!, -40);
  expect(noi()).toBeNull();
  swipe(page, -200);
  await waitFor(() => expect(noi()).toBe('page'));
  swipe(page, 200);
  await waitFor(() => expect(screen.getByRole('button', { name: /^Agenda/ }).getAttribute('aria-current')).toBe('page'));
});
