import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { describeRepeat, nextHour } from '../src/activity/timing.js';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { localNow, today } from '../src/dates.js';
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

/**
 * The times of each day used to show only on an activity that already had «Data e ora»: on one with no date, or with a
 * due date, Ripeti gave the days no time at all and nothing said why. Each chosen day now has its start and end in any
 * case; the first time written makes the schedule the engine needs, the days left empty take it.
 */
test('testEachDayTakesItsTimeWithoutASchedule', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick(/^\+ Ripeti/);
  userClick('mar');
  userClick('gio');
  // Asked by the user on 2026-11-13: the fields come filled with the next full hour and the one after, not empty.
  expect((screen.getByLabelText('Inizio mar') as HTMLInputElement).value).toBe(nextHour(localNow()).start);
  expect((screen.getByLabelText('Fine gio') as HTMLInputElement).value).toBe(nextHour(localNow()).end);
  // Tuesday keeps the time it came with, Thursday gets its own: changing one day must not move the other.
  userType(screen.getByLabelText('Inizio gio'), '10:10');
  userType(screen.getByLabelText('Fine gio'), '11:30');
  expect((screen.getByLabelText('Inizio mar') as HTMLInputElement).value).toBe(nextHour(localNow()).start);
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props.repeat).toEqual({
    mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', times: { TH: { start: '10:10', end: '11:30' } },
  }));
  const { props } = (await s.primary.getActivity('idea')).activity;
  expect(props.schedule).toEqual({ start: `${today()}T${nextHour(localNow()).start}`, end: `${today()}T${nextHour(localNow()).end}` });
  expect(props.due).toBeUndefined();
});

test('testTheNextFullHourIsWhatTheDaysStartWith', () => {
  expect(nextHour('2026-11-13T17:01')).toEqual({ start: '18:00', end: '19:00' });
  expect(nextHour('2026-11-13T17:59')).toEqual({ start: '18:00', end: '19:00' });
  expect(nextHour('2026-11-13T08:00')).toEqual({ start: '09:00', end: '10:00' });
  // Late in the evening the day has no next hour: the last one, to its end.
  expect(nextHour('2026-11-13T23:30')).toEqual({ start: '23:00', end: '23:59' });
  expect(nextHour('2026-11-13T22:10')).toEqual({ start: '23:00', end: '23:59' });
});

/** A due date under the series becomes the schedule, on the same day, once a day has a time. */
test('testADueDateBecomesTheScheduleOnceADayHasATime', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick(/^\+ Ripeti/);
  userType(screen.getByLabelText('Inizio ven'), '09:00');
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.repeat).toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=FR' }));
  const { props } = (await s.primary.getActivity('costi')).activity;
  expect(props.schedule).toEqual({ start: '2026-11-06T09:00' });
  expect(props.due).toBeUndefined();
});

/** No time written: the series keeps its day only, as before. */
test('testWithoutATimeTheDueDateStays', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick(/^\+ Ripeti/);
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.repeat).toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=FR' }));
  const { props } = (await s.primary.getActivity('costi')).activity;
  expect(props.due).toBe('2026-11-06');
  expect(props.schedule).toBeUndefined();
});

/**
 * A weekly series showed the date it starts from as a row of its own («Data e ora 2026-11-13 18:00», a Friday, on a
 * series of Tuesdays and Thursdays): a day nobody chose. The row is gone and Ripeti says every day's time.
 */
test('testAWeeklySeriesSaysItsTimesAndHidesTheDateItStartsFrom', async () => {
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', times: { TH: { start: '18:00', end: '19:15' } } }, { start: '09:00', end: '09:30' }))
    .toBe('ogni settimana, mar 9–9:30, gio 18–19:15');
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' }, { start: '09:00', end: '09:30' })).toBe('ogni settimana, mar e gio 9–9:30');
  // Asked by the user on 2026-11-13: no mile-long lines. Days with the same time go together, hours lose their «:00».
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH,SA', times: { TH: { start: '18:00', end: '19:30' } } }, { start: '18:00', end: '19:00' }))
    .toBe('ogni settimana, mar e sab 18–19, gio 18–19:30');
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'Controllo backup' });
  expect(screen.getByText('ogni settimana, mar e gio 9–9:30')).toBeTruthy();
  expect(screen.queryByText('Data e ora')).toBeNull();
});

/** A monthly series keeps the row: its date is the day of the month, and the only place its time is written. */
test('testAMonthlySeriesKeepsItsDate', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick(/^\+ Ripeti/);
  userType(screen.getByLabelText('Unità di ripetizione'), 'month');
  userClick('Aggiungi');
  await screen.findByText(/^ogni mese/);
  expect(screen.getByText('Scadenza')).toBeTruthy();
  expect(screen.getByText(/per toglierla, togli prima Ripeti/)).toBeTruthy();
});
