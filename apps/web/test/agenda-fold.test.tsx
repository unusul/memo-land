import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { complete } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { isExpanded, toggleExpanded } from '../src/groups/barPrefs.js';
import { PIPPO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

/*
 * Rows reduced and expanded in the Agenda (user's choices, 2026-11-16 and 2026-11-17): in a group of two or three people
 * a row starts in full, so who looks sees at once whether it is free or whose it is, on every day; in Personale, and
 * once done, skipped or moved away, it starts reduced, one lower line with the title on the left and the time on the
 * right. A small arrow switches each row for as long as the app stays open; «Sempre espansa», the person's own,
 * keeps an activity in full. Before: every row reduced at first, then today's in full; the user dropped both.
 */

beforeEach(() => { localStorage.clear(); clearFolds(); });

/** Controllo backup on Tuesdays and Thursdays from 3 November, the Tuesday done; in a shared group, or in Personale. */
function bench(group = 'domain:altereos.com') {
  const backend = benchBackend();
  const a = backend.activities.get('backup')!;
  backend.activities.set(a.id, { ...complete(a, PIPPO, '2026-11-03', a.updatedAt, '2026-11-03T09:00'), groupId: group });
  return memorySession(PIPPO, {}, backend);
}

const rows = async () => {
  await screen.findAllByText('Controllo backup');
  return [...document.querySelectorAll('.day')].filter(d => d.textContent?.includes('Controllo backup')).map(d => d.querySelector('.item-row')!) as HTMLElement[];
};
const reduced = (row: HTMLElement) => row.querySelector('.item.reduced') !== null;

/** In a shared group the open row starts in full, with whose it is; the done one reduced, title and time on one line. */
test('testSharedGroupRowsStartInFull', async () => {
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [done, open] = await rows();
  expect(reduced(open!)).toBe(false);
  expect(open!.querySelector('.meta')?.textContent).toBe('altereos.com · tu');
  expect(reduced(done!)).toBe(true);
  expect(done!.querySelector('.meta')).toBeNull();
  expect(done!.querySelector('.time')?.textContent).toBe('09:00–09:30');
});

/** In Personale every row starts reduced, today's too: nobody else can take it. */
test('testPersonalRowsStartReduced', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-05T08:00'));
    renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench(`personal:${PIPPO}`));
    const [done, openToday] = await rows();
    expect(reduced(done!)).toBe(true);
    expect(reduced(openToday!)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

/** The arrow switches the row both ways. */
test('testTheArrowExpandsAndReduces', async () => {
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [, open] = await rows();
  const reduce = within(open!).getByRole('button', { name: 'Riduci Controllo backup' });
  expect(reduce.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(reduce);
  await waitFor(() => expect(reduced(open!)).toBe(true));
  expect(open!.querySelector('.meta')).toBeNull();
  fireEvent.click(within(open!).getByRole('button', { name: 'Espandi Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(false));
});

/** The time is part of the arrow's button (user's choice, 2026-11-16): a tap on it expands too, and does not open the detail. */
test('testATapOnTheTimeExpands', async () => {
  const opened: string[] = [];
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={t => opened.push(t.activityId)} />, bench());
  const [done] = await rows();
  fireEvent.click(done!.querySelector('.time')!);
  await waitFor(() => expect(reduced(done!)).toBe(false));
  expect(opened).toEqual([]);
});

/** «Sempre espansa» in the detail, beside «Si chiude da sola»: the person's own, kept in their prefs. */
test('testAlwaysExpandedFromTheDetail', async () => {
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, bench());
  await screen.findByRole('heading', { name: 'Controllo backup' });
  const sw = screen.getByRole('button', { name: 'Sempre espansa' });
  expect(sw.previousElementSibling?.getAttribute('aria-label')).toBe('Si chiude da sola');
  fireEvent.click(sw);
  expect(isExpanded(PIPPO, 'backup')).toBe(true);
  expect(screen.getByRole('button', { name: 'Sempre espansa' }).getAttribute('aria-pressed')).toBe('true');
});

/** Always expanded, its rows start in full, in Personale and once done too; the arrow still reduces them. */
test('testAlwaysExpandedRowsStartInFull', async () => {
  toggleExpanded(PIPPO, 'backup');
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench(`personal:${PIPPO}`));
  const [done, open] = await rows();
  expect(reduced(done!)).toBe(false);
  expect(reduced(open!)).toBe(false);
  fireEvent.click(within(open!).getByRole('button', { name: 'Riduci Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(true));
});
