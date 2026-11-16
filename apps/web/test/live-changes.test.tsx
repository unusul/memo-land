import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 2, 9, 0));
});
afterEach(async () => { vi.useRealTimers(); cleanup(); await new Promise(r => setTimeout(r, 50)); });

/** Pluto renames the backup check: Pippo's agenda shows it at once, not at the next check 15 seconds later. */
async function renameByPluto(backend: ReturnType<typeof benchBackend>) {
  const pluto = backend.session(PLUTO);
  const a = (await pluto.getActivity('backup')).activity;
  await pluto.saveActivity({ ...a, title: 'Controllo backup e restore' }, a.version);
}

test('testAnotherPersonsChangeArrivesAtOnce', async () => {
  const backend = benchBackend();
  renderWithSession(<AgendaView from="2026-11-02" days={3} onOpen={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findAllByText('Controllo backup');
  await renameByPluto(backend);
  expect((await screen.findAllByText('Controllo backup e restore', {}, { timeout: 1000 })).length).toBeGreaterThan(0);
});

/**
 * An engine that sends no nudges (Google) is checked as soon as the app comes back to the foreground, where old data
 * is most likely (user's choice, 2026-11-16).
 */
test('testBackToTheForegroundChecksAtOnce', async () => {
  const backend = benchBackend();
  const session = memorySession(PIPPO, {}, backend);
  Object.assign(session.primary, { watchChanges: undefined });
  renderWithSession(<AgendaView from="2026-11-02" days={3} onOpen={() => undefined} />, session);
  await screen.findAllByText('Controllo backup');
  await renameByPluto(backend);
  await new Promise(r => setTimeout(r, 300));
  expect(screen.queryByText('Controllo backup e restore')).toBeNull();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
  expect((await screen.findAllByText('Controllo backup e restore', {}, { timeout: 1000 })).length).toBeGreaterThan(0);
});
