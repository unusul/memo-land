import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { complete } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { isExpanded, toggleExpanded } from '../src/groups/barPrefs.js';
import { PIPPO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

/*
 * Rows reduced and expanded in the Agenda (user's choices, 2026-11-16, and today's on 2026-11-17): every row starts reduced, one lower line with
 * the title on the left and the time on the right; a small arrow switches each row for as long as the app stays open.
 * «Sempre espansa», the person's own like the star, keeps an activity in full. Before, only done, skipped or moved-away
 * times started reduced, and the switch was «Sempre ridotta»: the user chose all reduced at first.
 */

beforeEach(() => { localStorage.clear(); clearFolds(); });

/** Controllo backup on Tuesdays and Thursdays from 3 November, the Tuesday done. */
function bench() {
  const backend = benchBackend();
  const a = backend.activities.get('backup')!;
  backend.activities.set(a.id, complete(a, PIPPO, '2026-11-03', a.updatedAt, '2026-11-03T09:00'));
  return memorySession(PIPPO, {}, backend);
}

const rows = async () => {
  await screen.findAllByText('Controllo backup');
  return [...document.querySelectorAll('.day')].filter(d => d.textContent?.includes('Controllo backup')).map(d => d.querySelector('.item-row')!) as HTMLElement[];
};
const reduced = (row: HTMLElement) => row.querySelector('.item.reduced') !== null;

/** Done or open, every row starts reduced: title and time on one line. */
test('testEveryRowStartsReduced', async () => {
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [done, open] = await rows();
  for (const row of [done!, open!]) {
    expect(reduced(row)).toBe(true);
    expect(row.querySelector('.meta')).toBeNull();
    expect(row.querySelector('.time')?.textContent).toBe('09:00–09:30');
  }
});

/** The arrow switches the row both ways. */
test('testTheArrowExpandsAndReduces', async () => {
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [, open] = await rows();
  const expand = within(open!).getByRole('button', { name: 'Espandi Controllo backup' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(expand);
  await waitFor(() => expect(reduced(open!)).toBe(false));
  expect(open!.querySelector('.meta')).not.toBeNull();
  fireEvent.click(within(open!).getByRole('button', { name: 'Riduci Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(true));
});

/** The time is part of the arrow's button (user's choice, 2026-11-16): a tap on it expands too, and does not open the detail. */
test('testATapOnTheTimeExpands', async () => {
  const opened: string[] = [];
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={t => opened.push(t.activityId)} />, bench());
  const [, open] = await rows();
  fireEvent.click(open!.querySelector('.time')!);
  await waitFor(() => expect(reduced(open!)).toBe(false));
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

/**
 * Today's rows still to do start in full (user's choice, 2026-11-17, «giorno attuale espanso»); done, skipped or
 * moved-away ones stay reduced, as every row of the other days. Before, today's rows started reduced too.
 */
test('testTodaysOpenRowsStartInFull', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-05T08:00'));
    renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
    const [doneTuesday, openToday] = await rows();
    expect(reduced(openToday!)).toBe(false);
    expect(reduced(doneTuesday!)).toBe(true);
    fireEvent.click(within(openToday!).getByRole('button', { name: 'Riduci Controllo backup' }));
    await waitFor(() => expect(reduced(openToday!)).toBe(true));
  } finally {
    vi.useRealTimers();
  }
});

/** Done today, the row stays reduced; an open row of another day too. */
test('testTodaysDoneRowStaysReduced', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-03T18:00'));
    renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
    const [doneToday, openThursday] = await rows();
    expect(reduced(doneToday!)).toBe(true);
    expect(reduced(openThursday!)).toBe(true);
  } finally {
    vi.useRealTimers();
  }
});

/** Always expanded, its rows start in full; the arrow still reduces them. */
test('testAlwaysExpandedRowsStartInFull', async () => {
  toggleExpanded(PIPPO, 'backup');
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [done, open] = await rows();
  expect(reduced(done!)).toBe(false);
  expect(reduced(open!)).toBe(false);
  fireEvent.click(within(open!).getByRole('button', { name: 'Riduci Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(true));
});
