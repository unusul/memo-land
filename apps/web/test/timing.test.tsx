import { screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { calendarStarts } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { describeRepeat, snoozeUntil, toRepeat } from '../src/activity/timing.js';
import { PIPPO, memorySession, renderWithSession, userClick, userType, pickDate, pickDateTime, pickedDate } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 23, 30));
});
afterEach(() => vi.useRealTimers());

test('testSnoozeInHoursCrossesMidnight', () => {
  expect(snoozeUntil('2026-11-04T23:30', 2, 'hour')).toBe('2026-11-05T01:30');
  expect(snoozeUntil('2026-11-04T23:30', 45, 'minute')).toBe('2026-11-05T00:15');
});

test('testSnoozeInMonthsKeepsTheTime', () => {
  expect(snoozeUntil('2026-01-31T09:15', 1, 'month')).toBe('2026-02-28T09:15');
  expect(snoozeUntil('2026-11-04T09:15', 2, 'week')).toBe('2026-11-18T09:15');
});

test('testWeeklyRuleWithIntervalAndDays', () => {
  const r = toRepeat({ mode: 'calendar', every: 2, unit: 'week', weekdays: ['MO', 'FR'], monthly: 'day' }, '2026-11-02');
  expect(r).toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR' });
  expect(describeRepeat(r)).toBe('ogni 2 settimane, lun e ven');
  expect(calendarStarts(r.mode === 'calendar' ? r.rrule : '', '2026-11-02', '2026-11-01T00:00', '2026-11-30T23:59'))
    .toEqual(['2026-11-02', '2026-11-06', '2026-11-16', '2026-11-20', '2026-11-30']);
});

test('testWeeklyRuleWithoutDaysUsesTheStartDay', () => {
  const r = toRepeat({ mode: 'calendar', every: 1, unit: 'week', weekdays: [], monthly: 'day' }, '2026-11-05');
  expect(r).toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TH' });
  expect(describeRepeat(r)).toBe('ogni settimana, gio');
});

test('testMonthlyRuleByDayOrByWeekday', () => {
  expect(describeRepeat(toRepeat({ mode: 'calendar', every: 1, unit: 'month', weekdays: [], monthly: 'day' }, '2026-11-15')))
    .toBe('ogni mese, il 15');
  const first = toRepeat({ mode: 'calendar', every: 1, unit: 'month', weekdays: [], monthly: 'nth' }, '2026-11-02');
  expect(first).toEqual({ mode: 'calendar', rrule: 'FREQ=MONTHLY;BYDAY=+1MO' });
  expect(describeRepeat(first)).toBe('ogni mese, il primo lunedì');
  const last = toRepeat({ mode: 'calendar', every: 3, unit: 'month', weekdays: [], monthly: 'nth' }, '2026-11-30');
  expect(last).toEqual({ mode: 'calendar', rrule: 'FREQ=MONTHLY;INTERVAL=3;BYDAY=-1MO' });
  expect(describeRepeat(last)).toBe('ogni 3 mesi, l\'ultimo lunedì');
});

test('testFromCompletionRule', () => {
  const r = toRepeat({ mode: 'fromCompletion', every: 3, unit: 'day', weekdays: [], monthly: 'day' }, '2026-11-04');
  expect(r).toEqual({ mode: 'fromCompletion', every: { unit: 'day', count: 3 } });
  expect(describeRepeat(r)).toBe('ogni 3 giorni da quando la completi');
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=YEARLY' })).toBe('ogni anno');
});

test('testSnoozeInTwoHoursFromTheDetail', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Rimanda…');
  userType(screen.getByLabelText('Quanti'), '2');
  userType(screen.getByLabelText('Unità'), 'hour');
  userClick('Rimanda');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props.resumeAt).toBe('2026-11-05T01:30'));
});

test('testSnoozeAtAChosenDateAndTime', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Rimanda…');
  pickDateTime('Il giorno', '2026-12-24T18:00');
  userClick('Rimanda al giorno scelto');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props.resumeAt).toBe('2026-12-24T18:00'));
});

test('testUsedSnoozeBecomesAShortcut', async () => {
  const s = memorySession();
  const view = renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Rimanda…');
  userType(screen.getByLabelText('Quanti'), '3');
  userType(screen.getByLabelText('Unità'), 'day');
  userClick('Rimanda');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props.resumeAt).toBe('2026-11-07T23:30'));
  view.unmount();
  vi.setSystemTime(new Date(2026, 10, 5, 8, 0));
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Rimanda…');
  userClick('tra 3 giorni');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props.resumeAt).toBe('2026-11-08T08:00'));
});

test('testRepeatFormShowsTheStartAndWritesTheRule', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick(/^\+ Ripeti/);
  expect(screen.queryByRole('group', { name: 'Parte dal' })).toBeNull();
  expect(screen.getByText(/parte da oggi/)).toBeTruthy();
  userType(screen.getByLabelText('Ogni'), '2');
  userType(screen.getByLabelText('Unità di ripetizione'), 'week');
  userClick('lun');
  userClick('ven');
  // The days come with a time already written; emptied, the series is of whole days and starts from a due date.
  userType(screen.getByLabelText('Inizio lun'), '');
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props).toMatchObject({
    due: '2026-11-04', repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,FR' },
  }));
  expect(await screen.findByText(/ogni 2 settimane, lun e ven/)).toBeTruthy();
});

/**
 * The form used to ask always for the day the series starts from, with its chips under the weekdays: nobody asked for it,
 * the engine needs it. It now starts today by itself, and the day is asked only from «cambia».
 */
test('testTheStartIsAskedOnlyFromCambia', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick(/^\+ Ripeti/);
  userClick('Cambia la partenza');
  expect(pickedDate('Parte dal')).toBe('2026-11-04');
  pickDate('Parte dal', '2026-11-09');
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props).toMatchObject({
    schedule: { start: '2026-11-09T23:00', end: '2026-11-09T23:59' }, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=MO' },
  }));
});

test('testRepeatOnDatedActivityStartsFromItsDate', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick(/^\+ Ripeti/);
  expect(screen.queryByLabelText('Parte dal')).toBeNull();
  expect(screen.getByText(/parte dalla scadenza, 2026-11-06/)).toBeTruthy();
  userType(screen.getByLabelText('Unità di ripetizione'), 'month');
  userType(screen.getByLabelText('Modo'), 'fromCompletion');
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.repeat)
    .toEqual({ mode: 'fromCompletion', every: { unit: 'month', count: 1 } }));
});

/** Rules saved by the old preset menu stay readable: before, the detail showed them raw ("a calendario (FREQ=…)"). */
test('testRulesFromTheOldPresetsAreDescribed', () => {
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' })).toBe('ogni settimana, mar e gio');
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' })).toBe('ogni mese, il 1 e il 15');
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY' })).toBe('ogni settimana');
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=HOURLY' })).toBe('FREQ=HOURLY');
});
