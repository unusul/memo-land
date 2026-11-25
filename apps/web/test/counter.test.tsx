import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { countOn } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { today } from '../src/dates.js';
import { ToastHost } from '../src/shell/toast.js';
import { memorySession, renderWithSession } from './memory-session.js';

/** An activity of the bench, with a counter and `n` counted today. */
async function withCounter(n: number) {
  const s = memorySession();
  const a = (await s.primary.getActivity('costi')).activity;
  await s.primary.saveActivity({ ...a, counter: { days: n ? { [today()]: n } : {} } }, a.version);
  return s;
}

/**
 * In the Agenda (user's choices, 2026-11-25): an activity with a counter is a row on today with today's count and a +,
 * which adds one without opening it.
 */
test('testThePlusInTheAgendaCountsOneMore', async () => {
  const s = await withCounter(2);
  renderWithSession(<AgendaView from={today()} days={3} onOpen={() => undefined} />, s);
  const plus = await screen.findByRole('button', { name: 'Uno in più a Analisi costi' });
  const row = plus.closest('.item-row') as HTMLElement;
  expect(within(row).getByLabelText('Oggi 2')).toBeTruthy();
  fireEvent.click(plus);
  expect(await within(row).findByLabelText('Oggi 3')).toBeTruthy();
  expect(countOn((await s.primary.getActivity('costi')).activity, today())).toBe(3);
});

/**
 * In the detail: «+ Contatore» adds it; − and + change today's count; «Azzera» brings it back to 0 and Annulla gives it
 * back (user's choice, 2026-11-25: resetting keeps the days before); the tabs show the bars of a span.
 */
test('testTheCounterInTheDetail', async () => {
  const s = memorySession();
  renderWithSession(<ToastHost><ActivityDetail activityId="costi" onClose={() => undefined} /></ToastHost>, s);
  fireEvent.click(await screen.findByRole('button', { name: '+ Contatore' }));
  const counter = await screen.findByRole('region', { name: 'Contatore' });
  fireEvent.click(within(counter).getByRole('button', { name: 'Uno in più' }));
  fireEvent.click(await within(counter).findByRole('button', { name: 'Uno in più' }));
  expect(await within(counter).findByLabelText('Oggi 2')).toBeTruthy();
  fireEvent.click(within(counter).getByRole('button', { name: 'Uno in meno' }));
  expect(await within(counter).findByLabelText('Oggi 1')).toBeTruthy();
  fireEvent.click(within(counter).getByRole('button', { name: 'Azzera' }));
  expect(await within(counter).findByLabelText('Oggi 0')).toBeTruthy();
  fireEvent.click(within((await screen.findByText(/azzerato per oggi/)).closest('.toast') as HTMLElement).getByRole('button', { name: 'Annulla' }));
  expect(await within(counter).findByLabelText('Oggi 1')).toBeTruthy();
  expect(within(counter).getAllByRole('listitem')).toHaveLength(7);
  fireEvent.click(within(counter).getByRole('radio', { name: 'Settimana' }));
  expect(within(counter).getAllByRole('listitem')).toHaveLength(8);
  expect(within(counter).getByText(/media 1 a settimana/)).toBeTruthy();
  await waitFor(async () => expect(countOn((await s.primary.getActivity('costi')).activity, today())).toBe(1));
});
