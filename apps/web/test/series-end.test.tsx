import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { describeRepeat } from '../src/activity/timing.js';
import { memorySession, pickDate, renderWithSession, userClick } from './memory-session.js';

/*
 * The end of a series in Ripeti (user's choices, 2026-11-16): «per sempre · imposta la fine», then «Finisce il» with the
 * date picker and «per sempre» to take it back; the row says «fino al 14 dic»; an end before the start is refused.
 */

beforeEach(() => localStorage.clear());

async function openRepeat() {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Controllo backup' });
  userClick('Modifica Ripeti');
  return s;
}

const stored = async (s: ReturnType<typeof memorySession>) => (await s.primary.getActivity('backup')).activity.props.repeat;

test('testTheRowSaysUntilWhen', () => {
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', until: '2026-12-14' }, { start: '09:00', end: '09:30' }))
    .toBe('ogni settimana, mar e gio 9–9:30, fino al 14 dic');
  expect(describeRepeat({ mode: 'fromCompletion', every: { unit: 'month', count: 1 }, until: '2027-01-08' })).toBe('ogni mese da quando la completi, fino all\'8 gen');
  expect(describeRepeat({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' }, { start: '09:00', end: '09:30' })).toBe('ogni settimana, mar e gio 9–9:30');
});

/** «per sempre · imposta la fine»; set, the series is saved with its last day and the row says it. */
test('testSetTheEnd', async () => {
  const s = await openRepeat();
  expect(screen.getByText(/per sempre/)).toBeTruthy();
  userClick('Imposta la fine');
  pickDate('Finisce il', '2026-12-14');
  userClick('Applica');
  await waitFor(async () => expect(await stored(s)).toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH', until: '2026-12-14' }));
  expect(await screen.findByText('ogni settimana, mar e gio 9–9:30, fino al 14 dic')).toBeTruthy();
});

/** «per sempre» beside the date takes the end away. */
test('testTakeTheEndAway', async () => {
  const s = await openRepeat();
  userClick('Imposta la fine');
  pickDate('Finisce il', '2026-12-14');
  userClick('Applica');
  await waitFor(async () => expect((await stored(s))?.until).toBe('2026-12-14'));
  userClick('Modifica Ripeti');
  userClick('Per sempre');
  userClick('Applica');
  await waitFor(async () => expect((await stored(s))?.until).toBeUndefined());
});

/** An end before the start: Applica stays off and the panel says why. */
test('testAnEndBeforeTheStartIsRefused', async () => {
  await openRepeat();
  userClick('Imposta la fine');
  pickDate('Finisce il', '2026-10-01');
  expect((screen.getByRole('button', { name: 'Applica' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText('La fine viene prima della partenza')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Per sempre' }));
  expect((screen.getByRole('button', { name: 'Applica' }) as HTMLButtonElement).disabled).toBe(false);
});
