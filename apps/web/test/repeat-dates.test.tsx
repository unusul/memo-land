import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { describeRepeat } from '../src/activity/timing.js';
import { PIPPO, memorySession, renderWithSession, userClick } from './memory-session.js';

/*
 * «A date scelte» in Ripeti (user's choices, 2026-11-17): the mode hides «Ripeti ogni», the days and the end; a month
 * where a tap lights a day and another puts it out; the days as chips, the start's own without ×. Before, another day
 * meant another activity.
 */

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 4, 10, 0));
});
afterEach(() => vi.useRealTimers());

const day = (label: string) => within(screen.getByRole('group', { name: 'Date scelte' })).getByRole('button', { name: label });

test('testChooseDaysOnAMonth', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick(/^\+ Ripeti/);
  // A new Ripeti opens on «seleziona date», the first mode (user's choice, 2026-11-17).
  expect(screen.getByRole('button', { name: 'Modo' }).textContent).toBe('seleziona date ▾');
  expect(screen.queryByLabelText('Ogni')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Imposta la fine' })).toBeNull();
  // The due date's day is lit and stays; a tap lights another day, a second tap puts it out.
  expect(day('venerdì 6 novembre 2026').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(day('venerdì 6 novembre 2026'));
  expect(day('venerdì 6 novembre 2026').getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(day('venerdì 13 novembre 2026'));
  fireEvent.click(day('venerdì 20 novembre 2026'));
  fireEvent.click(day('venerdì 13 novembre 2026'));
  expect(day('venerdì 13 novembre 2026').getAttribute('aria-pressed')).toBe('false');
  const chips = within(screen.getByLabelText('Giorni scelti'));
  expect(chips.getByText('ven 6 nov · da Scadenza')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mese dopo' }));
  fireEvent.click(day('venerdì 4 dicembre 2026'));
  fireEvent.click(chips.getByRole('button', { name: 'Togli ven 20 nov' }));
  expect(chips.queryByRole('button', { name: 'Togli ven 20 nov' })).toBeNull();
  userClick('Applica');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.repeat).toEqual({ mode: 'dates', dates: ['2026-12-04'] }));
});

/** Opened again, the panel shows the days kept; the detail says them all, the start's first. */
test('testChosenDaysAreReadBack', () => {
  expect(describeRepeat({ mode: 'dates', dates: ['2026-12-18', '2026-12-04'] }, undefined, '2026-11-20T08:00')).toBe('date selezionate: 20 nov, 4 dic, 18 dic');
});
