import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { complete, shapeOf } from '@attivita/core';
import type { AgendaItem } from '@attivita/core';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { activityOnDay, cellStrips, monthDays } from '../src/agenda/MonthView.js';
import { setHighlights } from '../src/groups/barPrefs.js';
import { agendaMode, setAgendaMode } from '../src/agenda/agendaMode.js';
import { TodayTitle } from '../src/shell/TodayTitle.js';
import { ViewStrip } from '../src/agenda/ViewStrip.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

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

/**
 * «Agenda | Calendario» in a strip at the bottom, under the thumb (user's choice, 2026-11-17; first on top of the
 * header): the one chosen is lit; in the month the header's date line goes.
 */
test('testStripSwitchesBetweenAgendaAndCalendar', async () => {
  renderWithSession(<><TodayTitle current onClick={() => undefined} /><AgendaView onOpen={() => undefined} /><ViewStrip /></>, bench());
  await screen.findByRole('button', { name: 'Mostra altre due settimane' });
  expect(screen.getByRole('button', { name: 'Agenda' }).getAttribute('aria-current')).toBe('page');
  fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));
  expect(agendaMode()).toBe('month');
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

/**
 * The arrows, beside the month's name in the header (user's choice, 2026-11-17: first over the grid), and a swipe on
 * the grid, go to the month before or after.
 */
test('testArrowsAndSwipeChangeMonth', async () => {
  setAgendaMode('month');
  renderWithSession(<><TodayTitle current onClick={() => undefined} /><AgendaView onOpen={() => undefined} /></>, bench());
  const grid = await screen.findByRole('grid', { name: 'Novembre 2026' });
  expect(document.querySelector('.month-title')?.textContent).toBe('Novembre 2026');
  fireEvent.click(screen.getByRole('button', { name: 'Mese dopo' }));
  expect(document.querySelector('.month-title')?.textContent).toBe('Dicembre 2026');
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
 * «+ Aggiungi» at the bottom of a day (user's choice, 2026-11-17; «Aggiungi il 5 novembre» until 2026-11-18, the day
 * being the panel's title already) hands the day to the page of a new
 * activity: in Personale, changeable from Dove, with Data e ora that day at 9:00. Not a draft: drafts are not in the
 * Agenda, and it would have vanished from the day it was added to.
 */
test('testAddOnADayOpensANewActivityThatDayAtNine', async () => {
  const added: string[] = [];
  setAgendaMode('month');
  renderWithSession(<AgendaView onOpen={() => undefined} onAddOn={day => added.push(day)} />, bench());
  fireEvent.click(cell(await screen.findByRole('grid'), '2026-11-05'));
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aggiungi' }));
  expect(added).toEqual(['2026-11-05']);
  const a = activityOnDay('2026-11-19', 'personal:p', 'p', '2026-11-05T08:00:00Z');
  expect([a.groupId, a.props.schedule, a.title, shapeOf(a, 'personal:p')]).toEqual(['personal:p', { start: '2026-11-19T09:00' }, '', 'event']);
});

/** The Calendar shows only the month (user's choices, 2026-11-17): In evidenza, Scadute, Proposte a te and In attesa
 * are the list's. Before, both views had them. */
test('testNoHighlightsInTheMonth', async () => {
  setHighlights(PIPPO, ['backup']);
  renderWithSession(<AgendaView onOpen={() => undefined} />, bench());
  expect(await screen.findByRole('list', { name: 'In evidenza' })).toBeTruthy();
  act(() => setAgendaMode('month'));
  expect(screen.queryByRole('list', { name: 'In evidenza' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'In attesa' })).toBeNull();
  expect(screen.queryByRole('heading', { level: 3 })).toBeNull();
});

/** A swipe on the strip: to the left the Calendar, to the right the Agenda. */
test('testSwipeOnTheStripSwitchesTheView', async () => {
  renderWithSession(<><AgendaView onOpen={() => undefined} /><ViewStrip /></>, bench());
  const strip = await screen.findByRole('group', { name: 'Vista' });
  fireEvent.pointerDown(strip, { clientX: 300, clientY: 700, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(strip, { clientX: 200, clientY: 705, pointerId: 1, pointerType: 'touch' });
  expect(agendaMode()).toBe('month');
  expect(await screen.findByRole('grid')).toBeTruthy();
  fireEvent.pointerDown(strip, { clientX: 200, clientY: 700, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(strip, { clientX: 300, clientY: 700, pointerId: 1, pointerType: 'touch' });
  expect(agendaMode()).toBe('list');
});

/** On 11 November Pluto has one overdue and one proposal: on top of the list, not in the Calendar. */
test('testNoOverdueNorProposalsInTheMonth', async () => {
  vi.setSystemTime(new Date('2026-11-11T09:00'));
  renderWithSession(<AgendaView onOpen={() => undefined} />, memorySession(PLUTO));
  expect(await screen.findByRole('list', { name: 'Scadute' })).toBeTruthy();
  expect(screen.getByRole('list', { name: 'Proposte a te' })).toBeTruthy();
  act(() => setAgendaMode('month'));
  expect(screen.queryByRole('list', { name: 'Scadute' })).toBeNull();
  expect(screen.queryByRole('list', { name: 'Proposte a te' })).toBeNull();
});
