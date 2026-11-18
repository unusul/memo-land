import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import type { Activity } from '@attivita/core';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { setAgendaMode } from '../src/agenda/agendaMode.js';
import { copyToDay } from '../src/agenda/copyToDay.js';
import { PIPPO, PLUTO, memorySession, renderWithSession } from './memory-session.js';

/*
 * «Copia su un altro giorno» from a row of a day in the Calendar (user's choices, 2026-11-17): the icon after the row,
 * then a line over the month «Tocca il giorno per …» and a tap on the day. Without a rule the day joins the same
 * activity («seleziona date»); a series by a rule gets a new activity of its own on that day, free. One day at a time.
 */

beforeEach(() => {
  localStorage.clear();
  clearFolds();
  setAgendaMode('month');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-05T08:00'));
});
afterEach(() => { vi.useRealTimers(); setAgendaMode('list'); });

const grid = () => screen.findByRole('grid', { name: 'Novembre 2026' });
const tapDay = async (day: string) => fireEvent.click((await grid()).querySelector(`[data-day="${day}"]`) as HTMLElement);

test('testCopyAddsTheDayToTheSameActivity', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<AgendaView onOpen={() => undefined} onAddOn={() => undefined} />, s);
  await tapDay('2026-11-06');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Copia Analisi costi su un altro giorno' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('status').textContent).toMatch(/Tocca il giorno per «Analisi costi»/);
  await tapDay('2026-11-20');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.repeat).toEqual({ mode: 'dates', dates: ['2026-11-20'] }));
  expect(screen.getByRole('status').textContent).toBe('Aggiunta il 20 nov');
  // One day at a time: the next tap opens the day again.
  await tapDay('2026-11-20');
  expect(within(screen.getByRole('dialog')).getByText('Analisi costi')).toBeTruthy();
});

/** Annulla on the line, or the day the activity is on already, changes nothing. */
test('testCopyGivenUpOrOnItsOwnDay', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<AgendaView onOpen={() => undefined} onAddOn={() => undefined} />, s);
  await tapDay('2026-11-06');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Copia Analisi costi su un altro giorno' }));
  fireEvent.click(within(screen.getByRole('status')).getByRole('button', { name: 'Annulla' }));
  expect(screen.queryByRole('status')).toBeNull();
  await tapDay('2026-11-06');
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Copia Analisi costi su un altro giorno' }));
  await tapDay('2026-11-06');
  expect(screen.getByRole('status').textContent).toBe("C'è già il 6 nov");
  expect((await s.primary.getActivity('costi')).activity.props.repeat).toBeUndefined();
});

/** Only who edits the group copies: a guest's rows have no icon. */
test('testNoCopyWithoutTheRightToEdit', async () => {
  renderWithSession(<AgendaView onOpen={() => undefined} onAddOn={() => undefined} />, memorySession('ospite@esterno.it'));
  await tapDay('2026-11-06');
  expect(within(screen.getByRole('dialog')).queryByRole('button', { name: /Copia .* su un altro giorno/ })).toBeNull();
});

/** A series by a rule gets a new activity on the day: its time and length, free, its list to do, no rule nor history. */
test('testASeriesByARuleGetsANewActivity', () => {
  const series: Activity = {
    ...newActivity({ id: 'gym', accountId: PIPPO, title: 'Palestra', body: 'scarpe', groupId: 'inv:developers' }, '2026-11-01T08:00:00Z'),
    props: {
      schedule: { start: '2026-11-03T18:30', end: '2026-11-03T19:30' }, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU' },
      priority: 'high', assignment: { state: 'accepted', assignee: PLUTO, assignedBy: PLUTO },
    },
    info: true,
    checklist: { items: [{ id: 'i1', text: 'asciugamano', done: true, assignee: PLUTO }], fixed: true, known: {}, seq: 1 },
  };
  const result = copyToDay(series, '2026-11-28', PIPPO, '2026-11-05T08:00:00Z');
  expect(result.kind).toBe('created');
  if (result.kind !== 'created') return;
  const copy = result.activity;
  expect(copy.id).not.toBe('gym');
  expect([copy.title, copy.body, copy.groupId, copy.info]).toEqual(['Palestra', 'scarpe', 'inv:developers', true]);
  expect(copy.props).toEqual({ schedule: { start: '2026-11-28T18:30', end: '2026-11-28T19:30' }, priority: 'high' });
  expect(copy.checklist?.items).toEqual([{ id: 'i1', text: 'asciugamano', done: false }]);
  expect(copy.history.map(h => h.kind)).toEqual(['created']);
});
