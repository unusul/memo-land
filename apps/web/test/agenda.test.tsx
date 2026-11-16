import { act, fireEvent, renderHook, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { useWorkspace } from '../src/workspace/useWorkspace.js';
import { PLUTO, memorySession, renderWithSession } from './memory-session.js';

test('testAgendaShowsCoverAndWaiting', async () => {
  renderWithSession(<AgendaView from="2026-11-02" days={14} onOpen={() => undefined} />, memorySession(PLUTO));
  expect(await screen.findAllByText('Controllo backup')).toHaveLength(4);
  expect(screen.getByRole('heading', { name: 'In attesa' })).toBeTruthy();
  expect(screen.getByText(/chiusura della ops 412/)).toBeTruthy();
});

test('testGuestSeesOnlyTheirGroups', async () => {
  renderWithSession(<AgendaView from="2026-11-02" days={14} onOpen={() => undefined} />, memorySession('ospite@esterno.it'));
  expect(await screen.findByText('Analisi costi')).toBeTruthy();
  expect(screen.queryByText('Controllo backup')).toBeNull();
});

/** Two tabs: the other one saved first, so ours must reload and explain instead of overwriting. */
test('testConflictReloadsAndExplains', async () => {
  const s = memorySession();
  const { result } = renderHook(() => useWorkspace(s.engines));
  await waitFor(() => expect(result.current.activities.length).toBeGreaterThan(0));
  const a = result.current.activities.find(x => x.id === 'sal')!;
  await s.primary.saveActivity({ ...a, title: 'other tab' }, a.version);
  await act(() => result.current.save({ ...a, title: 'mine' }).catch(() => undefined));
  expect(result.current.error).toMatch(/Qualcun altro/);
  expect(result.current.activities.find(x => x.id === 'sal')?.title).toBe('other tab');
});

/** An event with an end says both times, «09:00–09:30»; one without says its start only (asked on 2026-11-16). */
test('testTimedRowsShowTheirEnd', async () => {
  renderWithSession(<AgendaView from="2026-11-02" days={3} onOpen={() => undefined} />, memorySession());
  const row = (await screen.findAllByText('Controllo backup'))[0]!.closest('.item') as HTMLElement;
  expect(row.querySelector('.time')?.textContent).toBe('09:00–09:30');
});

/** «Mostra altre due settimane» at the bottom of the days (user's choice, 2026-11-16): 14 more days at each tap. */
test('testShowTwoMoreWeeks', async () => {
  renderWithSession(<AgendaView from="2026-11-02" days={14} onOpen={() => undefined} />, memorySession(PLUTO));
  expect(await screen.findAllByText('Controllo backup')).toHaveLength(4);
  const more = () => fireEvent.click(screen.getByRole('button', { name: 'Mostra altre due settimane' }));
  more();
  await waitFor(() => expect(screen.getAllByText('Controllo backup')).toHaveLength(8));
  more();
  await waitFor(() => expect(screen.getAllByText('Controllo backup')).toHaveLength(12));
});
