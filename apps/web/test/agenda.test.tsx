import { act, renderHook, screen, waitFor } from '@testing-library/react';
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
