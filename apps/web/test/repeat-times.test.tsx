import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { describeRepeat } from '../src/activity/timing.js';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { memorySession, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());

async function openRepeat() {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Controllo backup' });
  userClick('Modifica Ripeti');
  return s;
}

/** Beside each chosen day its start and end, filled with the schedule's: only the days changed get a time of their own. */
test('testEachChosenDayHasItsTimeFilledWithTheSchedules', async () => {
  await openRepeat();
  expect((screen.getByLabelText('Inizio gio') as HTMLInputElement).value).toBe('09:00');
  expect((screen.getByLabelText('Fine gio') as HTMLInputElement).value).toBe('09:30');
  expect(screen.getByLabelText('Inizio mar')).toBeTruthy();
  expect(screen.queryByLabelText('Inizio lun')).toBeNull();
});

test('testAChangedDayIsSavedWithItsOwnTime', async () => {
  const s = await openRepeat();
  userType(screen.getByLabelText('Inizio gio'), '18:00');
  userType(screen.getByLabelText('Fine gio'), '19:15');
  userClick('Salva');
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.props.repeat).toEqual({
    mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', times: { TH: { start: '18:00', end: '19:15' } },
  }));
});

test('testTheRuleSaysTheDaysOwnTime', () => {
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', times: { TH: { start: '18:00', end: '19:15' } } }))
    .toBe('ogni settimana, mar e gio 18:00–19:15');
});

/** The agenda shows Thursday at its own time, Tuesday at the schedule's. */
test('testTheAgendaShowsEachDaysTime', async () => {
  const s = memorySession();
  const { activity } = await s.primary.getActivity('backup');
  await s.primary.saveActivity({ ...activity, props: { ...activity.props, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', times: { TH: { start: '18:00', end: '19:15' } } } } }, activity.version);
  renderWithSession(<AgendaView from="2026-11-02" days={7} onOpen={() => undefined} />, s);
  const rows = (await screen.findAllByText('Controllo backup')).map(t => t.closest('.item')!.querySelector('.time')!.textContent);
  expect(rows).toEqual(['09:00', '18:00']);
});

test('testAnEmptiedTimeGoesBackToTheSchedules', async () => {
  const s = await openRepeat();
  userType(screen.getByLabelText('Inizio gio'), '18:00');
  fireEvent.click(screen.getByRole('button', { name: 'gio' }));
  fireEvent.click(screen.getByRole('button', { name: 'gio' }));
  expect((screen.getByLabelText('Inizio gio') as HTMLInputElement).value).toBe('18:00');
  userType(screen.getByLabelText('Inizio gio'), '09:00');
  userClick('Salva');
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.history.at(-1)?.kind).toBe('propSet'));
  expect((await s.primary.getActivity('backup')).activity.props.repeat).toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' });
});
