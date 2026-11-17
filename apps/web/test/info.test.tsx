import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { setInfo, setOffCalendar } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { setAgendaMode } from '../src/agenda/agendaMode.js';
import { TodayTitle } from '../src/shell/TodayTitle.js';
import { PIPPO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

/*
 * «Informazione utile» and «Non mostrare in calendario» (user's choices, 2026-11-17): two switches of the detail, the
 * group's, with In evidenza always the last of them on the right. An information stays in the Agenda on its day,
 * reduced and grey with «info», and leaves the Calendar; an activity switched off the Calendar leaves it too, and stays
 * an ordinary row in the Agenda. Before, everything with a date was in both.
 */

beforeEach(() => {
  localStorage.clear();
  clearFolds();
  setAgendaMode('list');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T08:00'));
});
afterEach(() => vi.useRealTimers());

/** The two switches between Riga nell'Agenda and In evidenza, which stays the last; both saved on the activity. */
test('testTheTwoSwitchesOfTheDetail', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Controllo backup' });
  const row = screen.getByRole('button', { name: 'In evidenza' }).parentElement!;
  const names = [...row.querySelectorAll('button')].map(b => b.getAttribute('aria-label'));
  expect(names.slice(0, 5)).toEqual(['Si chiude da sola', "Riga nell'Agenda", 'Informazione utile', 'Non mostrare in calendario', 'In evidenza']);
  fireEvent.click(screen.getByRole('button', { name: 'Informazione utile' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.info).toBe(true));
  fireEvent.click(await screen.findByRole('button', { name: 'Non mostrare in calendario', pressed: false }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.offCalendar).toBe(true));
});

function bench(change: 'info' | 'off') {
  const backend = benchBackend();
  const a = backend.activities.get('backup')!;
  backend.activities.set(a.id, change === 'info' ? setInfo(a, true, a.updatedAt) : setOffCalendar(a, true, a.updatedAt));
  return memorySession(PIPPO, {}, backend);
}

/** An information in the Agenda: on its day, reduced, «info»; the arrow still opens it. */
test('testAnInformationIsReducedWithInfo', async () => {
  renderWithSession(<AgendaView from="2026-11-05" days={1} onOpen={() => undefined} />, bench('info'));
  const row = (await screen.findByText('Controllo backup')).closest('.item-row') as HTMLElement;
  const item = row.querySelector('.item')!;
  expect(item.classList.contains('reduced')).toBe(true);
  expect(item.classList.contains('info')).toBe(true);
  expect(within(row).getByText('info')).toBeTruthy();
});

/** Out of the Calendar: an information, and an activity switched off there. */
test.each(['info', 'off'] as const)('testOutOfTheCalendar %s', async change => {
  setAgendaMode('month');
  renderWithSession(<AgendaView onOpen={() => undefined} />, bench(change));
  const grid = await screen.findByRole('grid', { name: 'Novembre 2026' });
  await new Promise(r => setTimeout(r, 0));
  expect(within(grid).queryByText('Controllo backup')).toBeNull();
});

/** Switched off the Calendar, it is still an ordinary row in the Agenda. */
test('testOffCalendarStaysInTheAgenda', async () => {
  renderWithSession(<AgendaView from="2026-11-05" days={1} onOpen={() => undefined} />, bench('off'));
  const item = (await screen.findByText('Controllo backup')).closest('.item')!;
  expect(item.classList.contains('info')).toBe(false);
});

/** Not one of today's things in the header: on 5 November the backup is the only one, as an information it says none. */
test('testAnInformationIsNotOneOfTodaysThings', async () => {
  vi.setSystemTime(new Date('2026-11-05T08:00'));
  renderWithSession(<TodayTitle current onClick={() => undefined} />, bench('off'));
  await screen.findByText(/1 cosa oggi/);
  renderWithSession(<TodayTitle current onClick={() => undefined} />, bench('info'));
  expect(await screen.findByText(/niente in agenda oggi/)).toBeTruthy();
});
