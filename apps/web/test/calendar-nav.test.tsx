import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setAgendaMode } from '../src/agenda/agendaMode.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

/*
 * The Calendar is a step inside the Agenda (user's choice, 2026-11-17): the Agenda is where one starts and comes back
 * to. Swiping into it, or back from another section, shows the list; back from the Calendar, by the phone's button or
 * by a swipe to the right, goes to the list first. Before, the view chosen was remembered and synced between devices,
 * and the app came back to the Calendar.
 */

beforeEach(() => {
  localStorage.clear();
  setAgendaMode('list');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
});
afterEach(async () => { vi.useRealTimers(); cleanup(); await new Promise(r => setTimeout(r, 50)); });

function swipe(el: Element, dx: number) {
  fireEvent.pointerDown(el, { clientX: 300, clientY: 300, pointerId: 1, pointerType: 'touch' });
  fireEvent.pointerUp(el, { clientX: 300 + dx, clientY: 300, pointerId: 1, pointerType: 'touch' });
}
const view = (name: 'Agenda' | 'Calendario') => screen.getByRole('button', { name }).getAttribute('aria-current');

async function openCalendar() {
  renderWithSession(<Shell />, memorySession(PIPPO));
  await screen.findAllByText('Controllo backup');
  fireEvent.click(screen.getByRole('button', { name: 'Calendario' }));
  expect(view('Calendario')).toBe('page');
}

test('testBackFromTheCalendarGoesToTheAgenda', async () => {
  await openCalendar();
  await new Promise(r => setTimeout(r, 10));
  window.history.back();
  await waitFor(() => expect(view('Agenda')).toBe('page'));
  expect(screen.queryByRole('grid')).toBeNull();
});

test('testSwipeRightFromTheCalendarGoesToTheAgenda', async () => {
  await openCalendar();
  swipe(document.querySelector('main.content')!, 200);
  await waitFor(() => expect(view('Agenda')).toBe('page'));
});

/** Out to Noi from the Calendar and back by swipe: the list, not the Calendar. */
test('testSwipingBackIntoTheAgendaShowsTheList', async () => {
  await openCalendar();
  const nav = screen.getByRole('navigation', { name: 'Sezioni' });
  swipe(document.querySelector('main.content')!, -200);
  await waitFor(() => expect(within(nav).getByRole('button', { name: 'Noi' }).getAttribute('aria-current')).toBe('page'));
  swipe(document.querySelector('main.content')!, 200);
  await waitFor(() => expect(view('Agenda')).toBe('page'));
  expect(screen.queryByRole('grid')).toBeNull();
});

/**
 * On a wide screen the strip sits under the header, as it looks at the bottom of a phone (user's choice, 2026-11-17;
 * for a moment the pill was inside the header, beside the date); on a phone it stays at the bottom, under the thumb.
 */
test('testTheStripIsUnderTheHeaderOnWideScreens', async () => {
  const wide = (on: boolean) => vi.spyOn(window, 'matchMedia').mockImplementation(q => ({
    matches: on && q.includes('min-width'), media: q, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  }) as MediaQueryList);
  wide(true);
  renderWithSession(<Shell />, memorySession(PIPPO));
  await screen.findAllByText('Controllo backup');
  expect(screen.getByRole('group', { name: 'Vista' }).previousElementSibling?.tagName).toBe('HEADER');
  cleanup();
  wide(false);
  renderWithSession(<Shell />, memorySession(PIPPO));
  await screen.findAllByText('Controllo backup');
  expect(screen.getByRole('group', { name: 'Vista' }).nextElementSibling?.tagName).toBe('NAV');
  vi.restoreAllMocks();
});
