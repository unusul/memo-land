import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { DatePicker, dayLabel, monthGrid } from '../src/activity/DatePicker.js';
import { addDays, today } from '../src/dates.js';
import { PIPPO, benchBackend, memorySession, pickDate, pickedDate, renderWithSession, userClick } from './memory-session.js';

test('testMonthGridStartsOnMondayWithBlanks', () => {
  // 1 November 2026 is a Sunday: six blanks before it, thirty days.
  const grid = monthGrid('2026-11');
  expect(grid.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
  expect(grid.filter(Boolean)).toHaveLength(30);
  expect(grid.at(-1)).toBe('2026-11-30');
  expect(dayLabel('2026-11-20')).toBe('venerdì 20 novembre 2026');
});

/** A month to leaf through instead of a field to type in: today marked, the chosen day highlighted. */
test('testCalendarShowsTheMonthOfTheValue', () => {
  render(<DatePicker label="Scadenza" value="2026-11-06" onChange={() => undefined} />);
  const cal = screen.getByRole('group', { name: 'Scadenza' });
  expect(within(cal).getByText('novembre 2026')).toBeTruthy();
  expect(within(cal).getByRole('button', { name: dayLabel('2026-11-06') }).getAttribute('aria-pressed')).toBe('true');
  expect(within(cal).getAllByRole('button', { pressed: true })).toHaveLength(1);
});

test('testArrowsLeafThroughTheMonthsAndATapChooses', () => {
  const onChange = vi.fn();
  render(<DatePicker label="Scadenza" value="2026-12-30" onChange={onChange} />);
  const cal = screen.getByRole('group', { name: 'Scadenza' });
  fireEvent.click(within(cal).getByRole('button', { name: 'Mese dopo' }));
  expect(within(cal).getByText('gennaio 2027')).toBeTruthy();
  fireEvent.click(within(cal).getByRole('button', { name: dayLabel('2027-01-08') }));
  expect(onChange).toHaveBeenCalledWith('2027-01-08');
  fireEvent.click(within(cal).getByRole('button', { name: 'Mese prima' }));
  fireEvent.click(within(cal).getByRole('button', { name: 'Mese prima' }));
  expect(within(cal).getByText('novembre 2026')).toBeTruthy();
});

test('testShortcutsAndTodayMarked', () => {
  const onChange = vi.fn();
  render(<DatePicker label="Scadenza" value="" onChange={onChange} />);
  const cal = screen.getByRole('group', { name: 'Scadenza' });
  expect(within(cal).getByRole('button', { name: dayLabel(today()) }).getAttribute('aria-current')).toBe('date');
  fireEvent.click(within(cal).getByRole('button', { name: 'Oggi' }));
  fireEvent.click(within(cal).getByRole('button', { name: 'Domani' }));
  fireEvent.click(within(cal).getByRole('button', { name: 'Tra una settimana' }));
  expect(onChange.mock.calls.map(c => c[0])).toEqual([today(), addDays(today(), 1), addDays(today(), 7)]);
});

test('testDueIsChosenOnTheCalendar', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick('Modifica Scadenza');
  expect(pickedDate('Scadenza')).toBe('2026-11-06');
  pickDate('Scadenza', '2026-12-02');
  userClick('Salva');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.due).toBe('2026-12-02'));
});

/** «Copro io questa» is for taking one occurrence from someone else: in the personal group they are all the person's. */
test('testNoCoverInThePersonalGroup', async () => {
  const backend = benchBackend();
  backend.activities.set('palestra', {
    ...newActivity({ id: 'palestra', accountId: PIPPO, title: 'Palestra', groupId: `personal:${PIPPO}` }, '2026-11-01T08:00:00Z'),
    props: { schedule: { start: '2026-11-03T18:30', end: '2026-11-03T19:30' }, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU' } },
  });
  renderWithSession(<ActivityDetail activityId="palestra" occurrenceKey="2026-11-10T18:30" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findByRole('button', { name: 'Fatto' });
  expect(screen.queryByRole('button', { name: 'Copro io questa' })).toBeNull();
});
