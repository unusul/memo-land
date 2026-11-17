import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { complete, shapeOf } from '@attivita/core';
import type { AgendaItem } from '@attivita/core';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { activityOnDay, cellStrips, monthDays } from '../src/agenda/MonthView.js';
import { setHighlights } from '../src/groups/barPrefs.js';
import { agendaMode, setAgendaMode } from '../src/agenda/agendaMode.js';
import { TodayTitle } from '../src/shell/TodayTitle.js';
import { PIPPO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

/*
 * The Agenda as a month (user's choices, 2026-11-17): a second view beside the list, switched by «Agenda | Calendario»
 * in the header (first «Elenco · Mese» inside the page) and remembered for the person; a tall grid with the titles cut in strips of the group's colour, up to four, else three
 * and «+N»; arrows and a swipe on the grid change the month; a tap on a day opens that day's rows. Before, the Agenda
 * was only the list of days.
 */

beforeEach(() => {
  localStorage.clear();
  setAgendaMode('list');
  clearFolds();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T08:00'));
});
afterEach(() => vi.useRealTimers());

/** Controllo backup on Tuesdays and Thursdays from 3 November, the Tuesday done. */
function bench() {
  const backend = benchBackend();
  const a = backend.activities.get('backup')!;
  backend.activities.set(a.id, complete(a, PIPPO, '2026-11-03', a.updatedAt, '2026-11-03T09:00'));
  return memorySession(PIPPO, {}, backend);
}

const openMonth = async () => {
  setAgendaMode('month');
  renderWithSession(<AgendaView onOpen={() => undefined} />, bench());
  return screen.findByRole('grid', { name: 'Novembre 2026' });
};
const cell = (grid: HTMLElement, day: string) => grid.querySelector(`[data-day="${day}"]`) as HTMLElement;

test('testMonthDaysStartOnMondayAndFillTheWeeks', () => {
  const days = monthDays('2026-11');
  expect(days[0]).toBe('2026-10-26');
  expect(days.at(-1)).toBe('2026-12-06');
  expect(days.length).toBe(42);
  expect(monthDays('2027-02').length).toBe(28);
});

test('testFourStripsAtMostElseThreeAndMore', () => {
  const items = (n: number) => Array.from({ length: n }, (_, i) => ({ title: `t${i}` }) as AgendaItem);
  expect(cellStrips(items(4))).toEqual({ shown: items(4), more: 0 });
  expect(cellStrips(items(6))).toEqual({ shown: items(3), more: 3 });
});

/** «Agenda | Calendario» in the header: the one chosen is lit and remembered; in the month the date line goes. */
test('testHeaderSwitchesBetweenAgendaAndCalendar', async () => {
  const went: string[] = [];
  renderWithSession(<><TodayTitle current onClick={() => went.push('agenda')} /><AgendaView onOpen={() => undefined} /></>, bench());
  await screen.findByRole('button', { name: 'Mostra altre due settimane' });
  expect(screen.getByRole('button', { name: 'Agenda' }).getAttribute('aria-current')).toBe('page');
  fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));
  expect(agendaMode()).toBe('month');
  expect(went).toEqual(['agenda']);
  expect(screen.getByRole('button', { name: 'Calendario' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Agenda' }).getAttribute('aria-current')).toBeNull();
  expect(screen.getByRole('grid', { name: 'Novembre 2026' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Mostra altre due settimane' })).toBeNull();
  expect(document.querySelector('.today-line')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Agenda' }));
  expect(agendaMode()).toBe('list');
  expect(screen.queryByRole('grid')).toBeNull();
  expect(document.querySelector('.today-line')).not.toBeNull();
});

/** The title in a strip of its group's colour; a done time struck through; today marked. */
test('testCellsShowStripsAndToday', async () => {
  const grid = await openMonth();
  const done = within(cell(grid, '2026-11-03')).getByText('Controllo backup');
  const open = within(cell(grid, '2026-11-05')).getByText('Controllo backup');
  expect(done.classList.contains('done')).toBe(true);
  expect(open.classList.contains('done')).toBe(false);
  expect(open.getAttribute('style')).toContain('--grp');
  expect(cell(grid, '2026-11-05').getAttribute('aria-current')).toBe('date');
  expect(cell(grid, '2026-10-27').classList.contains('other')).toBe(true);
});

/** The arrows, and a swipe on the grid, go to the month before or after. */
test('testArrowsAndSwipeChangeMonth', async () => {
  const grid = await openMonth();
  fireEvent.click(screen.getByRole('button', { name: 'Mese dopo' }));
  expect(screen.getByRole('grid', { name: 'Dicembre 2026' })).toBeTruthy();
  const g = screen.getByRole('grid');
  fireEvent.pointerDown(g, { clientX: 300, clientY: 300, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(g, { clientX: 150, clientY: 310, pointerId: 1, pointerType: 'touch' });
  expect(screen.getByRole('grid', { name: 'Gennaio 2027' })).toBeTruthy();
  fireEvent.pointerDown(screen.getByRole('grid'), { clientX: 150, clientY: 300, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(screen.getByRole('grid'), { clientX: 300, clientY: 300, pointerId: 1, pointerType: 'touch' });
  fireEvent.click(screen.getByRole('button', { name: 'Mese prima' }));
  expect(screen.getByRole('grid', { name: 'Novembre 2026' })).toBeTruthy();
  expect(grid).toBeTruthy();
});

/** A tap on a day opens its rows, as in the list; Chiudi closes them. */
test('testTapOnADayOpensItsRows', async () => {
  const grid = await openMonth();
  fireEvent.click(cell(grid, '2026-11-05'));
  const sheet = screen.getByRole('dialog', { name: 'Giovedì 5 novembre' });
  expect(within(sheet).getByText('Controllo backup')).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('button', { name: 'Chiudi' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

/**
 * «+ Aggiungi il 5 novembre» at the bottom of a day (user's choice, 2026-11-17) hands the day to the page of a new
 * activity: in Personale, changeable from Dove, with Data e ora that day at 9:00. Not a draft: drafts are not in the
 * Agenda, and it would have vanished from the day it was added to.
 */
test('testAddOnADayOpensANewActivityThatDayAtNine', async () => {
  const added: string[] = [];
  setAgendaMode('month');
  renderWithSession(<AgendaView onOpen={() => undefined} onAddOn={day => added.push(day)} />, bench());
  fireEvent.click(cell(await screen.findByRole('grid'), '2026-11-05'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aggiungi il 5 novembre' }));
  expect(added).toEqual(['2026-11-05']);
  const a = activityOnDay('2026-11-19', 'personal:p', 'p', '2026-11-05T08:00:00Z');
  expect([a.groupId, a.props.schedule, a.title, shapeOf(a, 'personal:p')]).toEqual(['personal:p', { start: '2026-11-19T09:00' }, '', 'event']);
});

/** In evidenza and In attesa are the list's, not the month's (user's choices, 2026-11-17): before, both views had them. */
test('testNoHighlightsInTheMonth', async () => {
  setHighlights(PIPPO, ['backup']);
  renderWithSession(<AgendaView onOpen={() => undefined} />, bench());
  expect(await screen.findByRole('list', { name: 'In evidenza' })).toBeTruthy();
  act(() => setAgendaMode('month'));
  expect(screen.queryByRole('list', { name: 'In evidenza' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'In attesa' })).toBeNull();
});
