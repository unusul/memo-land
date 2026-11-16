import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { Shell } from '../src/shell/Shell.js';
import { OSPITE, PIPPO, benchBackend, memorySession, pickDateTime, renderWithSession, userClick } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  // The arrows' choices last while the app stays open: each test starts as at an opening.
  clearFolds();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
});
afterEach(async () => { vi.useRealTimers(); cleanup(); await new Promise(r => setTimeout(r, 50)); });

/** «Controllo backup»: Tuesday and Thursday at 09:00, pippo's; Tuesday 3 November is the occurrence these tests change. */
const TUESDAY = '2026-11-03T09:00';
const openTuesday = (s = memorySession(PIPPO)) => {
  renderWithSession(<ActivityDetail activityId="backup" occurrenceKey={TUESDAY} onClose={() => undefined} />, s);
  return s;
};
const occurrenceRow = () => screen.getByText('Occorrenza').nextElementSibling as HTMLElement;
const rowsOf = (title: string) => screen.getAllByText(title).map(t => t.closest('.item') as HTMLElement);

/** Skipping keeps the occurrence, marked «saltata»; Rimetti brings it back. */
test('testSkipThisOccurrenceAndPutItBack', async () => {
  openTuesday();
  fireEvent.click(await screen.findByRole('button', { name: 'Salta questa volta' }));
  await waitFor(() => expect(occurrenceRow().textContent).toMatch(/saltata/));
  expect(screen.queryByRole('button', { name: 'Fatto' })).toBeNull();
  userClick('Rimetti');
  await waitFor(() => expect(occurrenceRow().textContent).not.toMatch(/saltata/));
  expect(screen.getByRole('button', { name: 'Salta questa volta' })).toBeTruthy();
});

/** In the agenda a skipped occurrence stays on its day, struck through as a done one, with «saltata» (user's choice). */
test('testAgendaShowsSkippedStruckThrough', async () => {
  const backend = benchBackend();
  const s = memorySession(PIPPO, {}, backend);
  const a = (await s.primary.getActivity('backup')).activity;
  await s.primary.saveActivity({ ...a, overrides: { [TUESDAY]: { skipped: true } } }, a.version);
  renderWithSession(<AgendaView from="2026-11-02" days={3} onOpen={() => undefined} />, s);
  await screen.findAllByText('Controllo backup');
  const [tuesday] = rowsOf('Controllo backup');
  expect(tuesday!.className).toMatch(/\bdone\b/);
  // Reduced at first, as every time done or skipped (2026-11-16): its arrow shows «saltata».
  expect(tuesday!.className).toMatch(/\breduced\b/);
  fireEvent.click(within(tuesday!.parentElement!).getByRole('button', { name: 'Espandi Controllo backup' }));
  expect(within(tuesday!).getByText('saltata')).toBeTruthy();
});

/**
 * Moving shows the occurrence twice: struck through on its day, «spostata a ven 6 nov alle 20:00», and on the new day
 * at the new time, «spostata da mar 3 nov» (user's choice). Opening the moved one offers to put it back on its day.
 */
test('testMoveThisOccurrenceShowsOnBothDays', async () => {
  const s = openTuesday();
  fireEvent.click(await screen.findByRole('button', { name: 'Sposta questa volta…' }));
  pickDateTime('Nuovo giorno', '2026-11-06T20:00');
  userClick('Sposta');
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.overrides[TUESDAY]).toEqual({ moved: '2026-11-06T20:00' }));
  cleanup();

  const opened: Array<string | undefined> = [];
  renderWithSession(<AgendaView from="2026-11-02" days={7} onOpen={t => opened.push(t.occurrenceKey)} />, s);
  await screen.findAllByText('Controllo backup');
  const rows = rowsOf('Controllo backup');
  // The day it left is reduced at first, as every time done or skipped (2026-11-16): its arrow shows where it went.
  const left = rows.find(r => /\breduced\b/.test(r.className))!;
  fireEvent.click(within(left.parentElement!).getByRole('button', { name: 'Espandi Controllo backup' }));
  const arrived = rows.find(r => /spostata da/.test(r.textContent!))!;
  expect(left.className).toMatch(/\bdone\b/);
  expect(within(left).getByText('spostata a ven 6 nov alle 20:00')).toBeTruthy();
  expect(within(arrived).getByText('spostata da mar 3 nov')).toBeTruthy();
  expect(arrived.className).not.toMatch(/\bdone\b/);
  expect(within(arrived).getByText('20:00–20:30')).toBeTruthy();
  fireEvent.click(arrived);
  cleanup();

  renderWithSession(<ActivityDetail activityId="backup" occurrenceKey={opened[0]} onClose={() => undefined} />, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Rimetti al mar 3 nov' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.overrides).toEqual({}));
});

/** «Togli fatta» takes back a «Fatto» on that occurrence only. */
test('testTakeBackDoneOnOneOccurrence', async () => {
  openTuesday();
  fireEvent.click(await screen.findByRole('button', { name: 'Fatto' }));
  await waitFor(() => expect(occurrenceRow().textContent).toMatch(/fatta/));
  userClick('Togli fatta');
  await waitFor(() => expect(occurrenceRow().textContent).not.toMatch(/fatta/));
  expect(screen.getByRole('button', { name: 'Fatto' })).toBeTruthy();
});

/** A guest changes nothing in the group: no skip, no move. */
test('testGuestCannotSkipOrMove', async () => {
  const backend = benchBackend();
  const team = newActivity({ id: 'riunione', accountId: PIPPO, title: 'Riunione', groupId: 'inv:developers' }, '2026-11-01T08:00:00Z');
  team.props = { schedule: { start: '2026-11-02T10:00', end: '2026-11-02T11:00' }, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=MO' } };
  backend.activities.set('riunione', team);
  renderWithSession(<ActivityDetail activityId="riunione" occurrenceKey="2026-11-02T10:00" onClose={() => undefined} />, memorySession(OSPITE, {}, backend));
  await screen.findByText('Occorrenza');
  expect(screen.queryByRole('button', { name: 'Salta questa volta' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Sposta questa volta…' })).toBeNull();
});

/** In the agenda, towards the left a series' row is skipped; towards the right a done one gets «Togli fatta». */
test('testAgendaSwipesSkipAndTakeBackDone', async () => {
  vi.setSystemTime(new Date(2026, 10, 3, 8, 0));
  const s = memorySession(PIPPO);
  renderWithSession(<Shell />, s);
  const swipe = (el: Element, dx: number) => {
    fireEvent.pointerDown(el, { clientX: 300, clientY: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(el, { clientX: 300 + dx / 2, clientY: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerMove(el, { clientX: 300 + dx, clientY: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.pointerUp(el, { clientX: 300 + dx, clientY: 300, pointerId: 1, pointerType: 'touch' });
    fireEvent.click(el);
  };
  const firstRow = async () => (await screen.findAllByText('Controllo backup'))[0]!.closest('.swipe')!;
  swipe(await firstRow(), -150);
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.overrides[TUESDAY]).toEqual({ skipped: true }));
  userClick('Annulla');
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.overrides).toEqual({}));
  swipe(await firstRow(), 150);
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.history.at(-1)?.kind).toBe('completed'));
  await waitFor(() => expect(rowsOf('Controllo backup')[0]!.className).toMatch(/\bdone\b/));
  swipe(await firstRow(), 150);
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.history.at(-1)?.kind).toBe('occurrenceReopened'));
});
