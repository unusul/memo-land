import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { setAgendaMode } from '../src/agenda/agendaMode.js';
import { repeatableOn } from '../src/agenda/RepeatHere.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

/*
 * «Ripeti qui un evento» in a day of the Calendar (user's choices, 2026-11-17): beside «+ Aggiungi», the events a
 * day can be added to, the six nearest, a search when there are more; one chosen gets the day and becomes «a date
 * scelte». Series with a rule stay out. Before, another day of the same event meant another activity.
 */

beforeEach(() => {
  localStorage.clear();
  clearFolds();
  setAgendaMode('month');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T08:00'));
});
afterEach(() => { vi.useRealTimers(); setAgendaMode('list'); });

const openDay = async (day: string) => {
  const grid = await screen.findByRole('grid', { name: 'Novembre 2026' });
  fireEvent.click(grid.querySelector(`[data-day="${day}"]`) as HTMLElement);
  return screen.getByRole('dialog');
};

test('testRepeatAnEventOnTheDayTapped', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<AgendaView onOpen={() => undefined} onAddOn={() => undefined} />, s);
  const sheet = await openDay('2026-11-20');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Ripeti qui un evento' }));
  const list = within(sheet).getByRole('group', { name: 'Eventi da ripetere' });
  // Analisi costi has a due date and no rule; Controllo backup, a series by a rule, is not offered.
  expect(within(list).getByText('Analisi costi')).toBeTruthy();
  expect(within(list).getByText('developers · 6 nov')).toBeTruthy();
  expect(within(list).queryByText('Controllo backup')).toBeNull();
  // Aggiornare la documentazione waits for something: not on the Calendar, not offered.
  expect(within(list).queryByText('Aggiornare la documentazione')).toBeNull();
  expect(within(list).queryByRole('searchbox')).toBeNull();
  fireEvent.click(within(list).getByText('Analisi costi'));
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.repeat).toEqual({ mode: 'dates', dates: ['2026-11-20'] }));
  await waitFor(() => expect(within(screen.getByRole('dialog')).getByText('Analisi costi')).toBeTruthy());
  expect(within(screen.getByRole('dialog')).queryByRole('group', { name: 'Eventi da ripetere' })).toBeNull();
});

const group: Group = { id: 'inv:casa', kind: 'invite', name: 'Casa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 };
const mk = (id: string, due: string, extra: Partial<Activity['props']> = {}): Activity =>
  ({ ...newActivity({ id, accountId: PIPPO, title: id, groupId: group.id }, '2026-11-01T08:00:00Z'), props: { due, ...extra } });

/** The nearest to the day first, counting every day of an event; not one already on that day, nor a series by a rule. */
test('testTheNearestEventsComeFirst', () => {
  const events = [
    mk('far', '2026-10-01'),
    mk('near', '2026-11-22'),
    mk('chosen', '2026-10-10', { repeat: { mode: 'dates', dates: ['2026-11-19'] } }),
    mk('same-day', '2026-11-20'),
    mk('rule', '2026-11-20', { repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY' } }),
  ];
  expect(repeatableOn('2026-11-20', events, () => group, () => PIPPO).map(a => a.id)).toEqual(['chosen', 'near', 'far']);
});

/** With more than six events, a search on top; the list keeps six. */
test('testASearchWhenThereAreMoreThanSix', async () => {
  const s = memorySession(PIPPO);
  for (let i = 1; i <= 8; i++) {
    const a = (await s.primary.getActivity('costi')).activity;
    await s.primary.saveActivity({ ...a, id: `extra${i}`, title: `Cena ${i}`, version: 0, props: { due: `2026-11-${String(10 + i).padStart(2, '0')}` } } as Activity, null);
  }
  renderWithSession(<AgendaView onOpen={() => undefined} onAddOn={() => undefined} />, s);
  const sheet = await openDay('2026-11-20');
  fireEvent.click(within(sheet).getByRole('button', { name: 'Ripeti qui un evento' }));
  const list = within(sheet).getByRole('group', { name: 'Eventi da ripetere' });
  expect(list.querySelectorAll('.pick').length).toBe(6);
  fireEvent.change(within(list).getByRole('searchbox', { name: 'Cerca un evento' }), { target: { value: 'cena 2' } });
  expect([...list.querySelectorAll('.pick .t')].map(t => t.textContent)).toEqual(['Cena 2']);
});
