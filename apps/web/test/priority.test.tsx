import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { setProp } from '@attivita/core';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { PIPPO, memorySession, renderWithSession, userClick } from './memory-session.js';

beforeEach(() => localStorage.clear());

/** Three levels: alta, normale (nothing set) and bassa; set from a chip like the other properties. */
test('testPriorityIsSetFromItsChip', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick('+ Priorità');
  fireEvent.change(screen.getByLabelText('Priorità'), { target: { value: 'high' } });
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.priority).toBe('high'));
  expect(await screen.findByRole('button', { name: 'Modifica Priorità' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Modifica Priorità' }).textContent).toBe('alta');
});

test('testRemovingThePriorityMakesItNormal', async () => {
  const s = memorySession();
  const { activity } = await s.primary.getActivity('costi');
  await s.primary.saveActivity(setProp(activity, 'priority', 'low', PIPPO, '2026-11-13T10:00:00Z'), activity.version);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('button', { name: 'Togli Priorità' });
  userClick('Togli Priorità');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.priority).toBeUndefined());
});

/** In the agenda a high priority shows as «alta» beside the title; normal and low show nothing. */
test('testHighPriorityIsMarkedInTheAgenda', async () => {
  const s = memorySession();
  const { activity } = await s.primary.getActivity('sal');
  await s.primary.saveActivity(setProp(activity, 'priority', 'high', PIPPO, '2026-11-13T10:00:00Z'), activity.version);
  renderWithSession(<AgendaView from="2026-11-02" days={14} onOpen={() => undefined} />, s);
  const sal = (await screen.findByText('Stato avanzamento')).closest('.item') as HTMLElement;
  expect(within(sal).getByText('alta')).toBeTruthy();
  const backup = screen.getAllByText('Controllo backup')[0]!.closest('.item') as HTMLElement;
  expect(within(backup).queryByText('alta')).toBeNull();
});
