import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, memorySession, renderWithSession, userClick, pickDate, pickDateTime } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
});
// Unmounts first, then leaves time to the test's history entries to be taken back: each test starts from a quiet history.
afterEach(async () => { vi.useRealTimers(); cleanup(); await new Promise(r => setTimeout(r, 50)); });

const nav = () => screen.findByRole('navigation', { name: 'Sezioni' });
const agendaIsShown = () => expect(screen.getByRole('button', { name: /^Agenda/ }).getAttribute('aria-current')).toBe('page');
const noiIsShown = () => expect(within(screen.getByRole('navigation', { name: 'Sezioni' })).getByRole('button', { name: 'Noi' }).getAttribute('aria-current')).toBe('page');
/** As a person would: a moment after the screen opened, when its history entry is there. */
const back = async () => { await new Promise(r => setTimeout(r, 10)); window.history.back(); };

/**
 * The phone's back first cancels an open panel, as its Annulla (user's choice, 2026-11-17), then closes the activity.
 * Before, it closed the activity at once saving the panel's change.
 */
test('testBackCancelsThePanelThenClosesTheDetail', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<Shell />, s);
  fireEvent.click(within(await nav()).getByRole('button', { name: /^Io/ }));
  fireEvent.click(await screen.findByText('app gestione core'));
  await screen.findByRole('heading', { name: 'app gestione core' });
  // Data e ora keeps its form (Scadenza now applies from its menu at once, with nothing left open).
  userClick(/^\+ Data e ora/);
  pickDateTime('Data e ora', '2026-11-20T10:10');
  await back();
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Data e ora' })).toBeNull());
  expect(screen.getByRole('heading', { name: 'app gestione core' })).toBeTruthy();
  await back();
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'app gestione core' })).toBeNull());
  expect((await s.primary.getActivity('idea')).activity.props.schedule).toBeUndefined();
});

/** With nothing open, back walks back: the group's page, then Noi, then the agenda. */
test('testBackWalksFromAGroupToNoiToTheAgenda', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  fireEvent.click(within(await nav()).getByRole('button', { name: 'Noi' }));
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^altereos\.com/ }));
  await screen.findByRole('region', { name: 'Elenco di altereos.com' });
  await back();
  await waitFor(noiIsShown);
  await back();
  await waitFor(agendaIsShown);
});

/** Closed with Chiudi, the activity leaves no step behind: the next back goes on from the group's page, to Noi. */
test('testAfterChiudiBackGoesOnFromTheGroup', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  fireEvent.click(await within(await nav()).findByRole('button', { name: /^altereos\.com/ }));
  const list = await screen.findByRole('region', { name: 'Elenco di altereos.com' });
  fireEvent.click(within(list).getByText('Controllo backup'));
  await screen.findByRole('heading', { name: 'Controllo backup' });
  userClick('Indietro');
  await screen.findByRole('region', { name: 'Elenco di altereos.com' });
  await back();
  await waitFor(noiIsShown);
});

/** The new draft's sheet closes with back too, as Annulla. */
test('testBackClosesTheCaptureSheet', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  await nav();
  userClick('Nuova bozza');
  const field = await screen.findByPlaceholderText(/Scrivi/);
  expect(field).toBeTruthy();
  await back();
  await waitFor(() => expect(screen.queryByPlaceholderText(/Scrivi/)).toBeNull());
  agendaIsShown();
});

/**
 * Back from an activity added on a day of the Calendar, the month shown stays (user's bug, 2026-11-17: the grid went
 * back to the current month). Gone since the month is kept outside the Agenda's page (115df41); this keeps it so.
 */
test('testTheMonthStaysAfterAnActivityAddedOnIt', async () => {
  const { setAgendaMode } = await import('../src/agenda/agendaMode.js');
  renderWithSession(<Shell />, memorySession(PIPPO));
  await nav();
  setAgendaMode('month');
  fireEvent.click(await screen.findByRole('button', { name: 'Mese dopo' }));
  const grid = await screen.findByRole('grid', { name: 'Dicembre 2026' });
  fireEvent.click(grid.querySelector('[data-day="2026-12-10"]') as HTMLElement);
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Aggiungi/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Indietro' }));
  expect(await screen.findByRole('grid', { name: 'Dicembre 2026' })).toBeTruthy();
  setAgendaMode('list');
});
