import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { MeView } from '../src/me/MeView.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, PLUTO, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
});
afterEach(() => vi.useRealTimers());

const badge = async (tab: string) => {
  const nav = await screen.findByRole('navigation', { name: 'Sezioni' });
  const button = within(nav).getAllByRole('button').find(b => b.getAttribute('aria-label')?.split(',')[0] === tab)!;
  return button.querySelector('.badge')?.textContent ?? null;
};

test('testBadgesShowOnlyWhatNeedsYou', async () => {
  // Pluto: "Analisi costi" is proposed to him and past due (6 Nov). The agenda is not in the menu any more:
  // the header says it, in coral; the menu has no number.
  renderWithSession(<Shell />, memorySession(PLUTO));
  await screen.findAllByText('Analisi costi');
  expect(screen.getByRole('button', { name: /^Agenda/ }).querySelector('.urgent')?.textContent).toBe('1 scaduta · 1 proposta');
  expect(await badge('Noi')).toBeNull();
  expect(await badge('Io')).toBeNull();
});

test('testDraftsBadgeAndNoZeroCount', async () => {
  // Pippo: one draft to sort; the proposal is pluto's, so nothing waits for pippo in the agenda.
  renderWithSession(<Shell />, memorySession(PIPPO));
  await screen.findByRole('heading', { name: 'Agenda' });
  expect(await badge('Io')).toBe('1');
  expect(screen.getByRole('button', { name: /^Agenda/ }).querySelector('.urgent')).toBeNull();
  expect(screen.queryByText(/\(0\)/)).toBeNull();
});

test('testAgendaShowsOverdueAndProposals', async () => {
  renderWithSession(<AgendaView onOpen={() => undefined} />, memorySession(PLUTO));
  const overdue = await screen.findByRole('list', { name: 'Scadute' });
  expect(within(overdue).getByText('Analisi costi')).toBeTruthy();
  expect(within(overdue).getByText(/scaduta il 6 nov/)).toBeTruthy();
  const proposed = screen.getByRole('list', { name: 'Proposte a te' });
  expect(within(proposed).getByText(/da pippo/)).toBeTruthy();
});

test('testRefusedCaptureShowsInIoWithItsReason', async () => {
  const s = memorySession(PIPPO);
  // A draft owned by another account: the engine refuses it at every flush, so it stays queued with its reason.
  await s.outbox.put({ id: 'q1', account: PIPPO, activity: newActivity({ id: 'q1', accountId: 'altro@esterno.it', title: 'foto scontrino' }, '2026-11-10T08:00:00Z'),
    files: [], createdAt: '2026-11-10T08:00:00Z' });
  renderWithSession(<Shell />, s);
  // Io counts it beside pippo's draft to sort.
  await waitFor(async () => expect(await badge('Io')).toBe('2'));
  renderWithSession(<MeView />, s);
  const refused = await screen.findByRole('list', { name: 'Non accettate dal server' });
  expect(within(refused).getByText('foto scontrino')).toBeTruthy();
});

test('testRefusalReasonIsReadable', async () => {
  const s = memorySession(PIPPO);
  await s.outbox.put({ id: 'q2', account: PIPPO, activity: newActivity({ id: 'q2', accountId: PIPPO, title: 'nota' }, '2026-11-10T08:00:00Z'),
    files: [], createdAt: '2026-11-10T08:00:00Z', error: 'FORBIDDEN' });
  renderWithSession(<MeView />, s);
  const refused = await screen.findByRole('list', { name: 'Non accettate dal server' });
  expect(refused.textContent).not.toMatch(/FORBIDDEN/);
});

test('testOverdueDateReadsAsItalian', async () => {
  const s = memorySession(PIPPO);
  const due = newActivity({ id: 'ins', accountId: PIPPO, title: 'assicurazione', groupId: `personal:${PIPPO}` }, '2026-11-01T08:00:00Z');
  await s.primary.saveActivity({ ...due, props: { due: '2026-11-08' } }, null);
  renderWithSession(<AgendaView onOpen={() => undefined} />, s);
  expect(await screen.findByText(/scaduta l'8 nov/)).toBeTruthy();
});
