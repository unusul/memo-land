import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, memorySession, renderWithSession, userClick, pickDate } from './memory-session.js';

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

/** The phone's back closes the open activity as Chiudi does, saving a property form left open. */
test('testBackClosesTheDetailSavingTheOpenForm', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<Shell />, s);
  fireEvent.click(within(await nav()).getByRole('button', { name: /^Io/ }));
  fireEvent.click(await screen.findByText('app gestione core'));
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick(/^\+ Scadenza/);
  pickDate('Scadenza', '2026-11-20');
  await back();
  expect(await screen.findByText('Scadenza salvata')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'app gestione core' })).toBeNull();
  expect((await s.primary.getActivity('idea')).activity.props.due).toBe('2026-11-20');
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
