import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { complete } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { reducedOf, rowSizeOf, setHighlights, setRowSize } from '../src/groups/barPrefs.js';
import { PIPPO, benchBackend, fromMore, memorySession, openMore, renderWithSession } from './memory-session.js';

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

/**
 * A tap on the date reduces the whole day to one line, «1 attività», and another brings the rows back as they were
 * (user's choices, 2026-11-19): the rows keep their own state, so a row expanded by its arrow comes back expanded.
 */
test('testTheDateReducesTheWholeDay', async () => {
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [done] = await rows();
  fireEvent.click(within(done!).getByRole('button', { name: 'Espandi Controllo backup' }));
  await waitFor(() => expect(reduced(done!)).toBe(false));
  const date = screen.getByRole('button', { name: 'Riduci martedì 3 novembre' });
  expect(date.getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(date);
  const count = await screen.findByRole('button', { name: '1 attività' });
  expect(count.closest('.day')!.querySelector('.item-row')).toBeNull();
  expect(screen.getByRole('button', { name: 'Espandi martedì 3 novembre' }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.getAllByText('Controllo backup')).toHaveLength(1);
  fireEvent.click(count);
  const [again] = await rows();
  expect(reduced(again!)).toBe(false);
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

/**
 * How the rows start, from its icon in the detail's ⋯: a small menu of three, Automatica, Sempre espansa, Sempre
 * ridotta (user's choice, 2026-11-17; before, a switch for «Sempre espansa» alone). The person's own, in their prefs.
 * When it is not Automatica its lit icon also shows in the top row (2026-11-19), and opens the same three.
 */
test('testRowSizeMenuFromTheDetail', async () => {
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, bench());
  await screen.findByRole('heading', { name: 'Controllo backup' });
  expect(screen.queryByRole('button', { name: "Riga nell'Agenda" })).toBeNull();
  fromMore("Riga nell'Agenda");
  const menu = screen.getByRole('menu', { name: "Riga nell'Agenda" });
  expect(within(menu).getAllByRole('menuitemradio').map(b => b.textContent)).toEqual(['Automatica', 'Sempre espansa', 'Sempre ridotta']);
  expect(within(menu).getAllByRole('menuitemradio').every(b => b.querySelector('svg') !== null)).toBe(true);
  expect(within(menu).getByRole('menuitemradio', { name: 'Automatica' }).getAttribute('aria-checked')).toBe('true');
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Sempre ridotta' }));
  expect(rowSizeOf(PIPPO, 'backup')).toBe('reduced');
  expect(screen.getByRole('button', { name: "Riga nell'Agenda" }).classList.contains('on')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: "Riga nell'Agenda" }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Sempre espansa' }));
  expect(rowSizeOf(PIPPO, 'backup')).toBe('expanded');
  expect(reducedOf(PIPPO)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: "Riga nell'Agenda" }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'Automatica' }));
  expect(rowSizeOf(PIPPO, 'backup')).toBe('auto');
  expect(screen.queryByRole('button', { name: "Riga nell'Agenda" })).toBeNull();
  expect(within(openMore()).getByRole('button', { name: "Riga nell'Agenda" })).toBeTruthy();
});

/** Always expanded, its rows start in full, in Personale and once done too; the arrow still reduces them. */
test('testAlwaysExpandedRowsStartInFull', async () => {
  setRowSize(PIPPO, 'backup', 'expanded');
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench(`personal:${PIPPO}`));
  const [done, open] = await rows();
  expect(reduced(done!)).toBe(false);
  expect(reduced(open!)).toBe(false);
  fireEvent.click(within(open!).getByRole('button', { name: 'Riduci Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(true));
});

/** Always reduced, an open row of a shared group starts on one line too; the arrow still expands it. */
test('testAlwaysReducedRowsStartReduced', async () => {
  setRowSize(PIPPO, 'backup', 'reduced');
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [, open] = await rows();
  expect(reduced(open!)).toBe(true);
  fireEvent.click(within(open!).getByRole('button', { name: 'Espandi Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(false));
});

/**
 * The rows above the days take the days' arrow (user's choice, 2026-11-17; before, always in full and no arrow): in
 * full at first, with the next time beside the arrow, «5 nov 09:00»; on one line when kept «Sempre ridotta».
 */
test('testRowsAboveTheDaysFold', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  try {
    vi.setSystemTime(new Date('2026-11-05T08:00'));
    setHighlights(PIPPO, ['backup']);
    renderWithSession(<AgendaView from="2026-11-05" days={1} onOpen={() => undefined} />, bench());
    const list = await screen.findByRole('list', { name: 'In evidenza' });
    const row = list.querySelector('.item-row') as HTMLElement;
    expect(reduced(row)).toBe(false);
    expect(row.querySelector('.time')?.textContent).toBe('5 nov 09:00');
    fireEvent.click(within(row).getByRole('button', { name: 'Riduci Controllo backup' }));
    await waitFor(() => expect(reduced(row)).toBe(true));
    expect(row.querySelector('.meta')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

/** Kept «Sempre ridotta», a row above the days starts on one line; «Sempre espansa» changes nothing there. */
test('testRowsAboveTheDaysFollowAlwaysReduced', async () => {
  setHighlights(PIPPO, ['backup']);
  setRowSize(PIPPO, 'backup', 'reduced');
  renderWithSession(<AgendaView from="2026-11-03" days={1} onOpen={() => undefined} />, bench());
  const list = await screen.findByRole('list', { name: 'In evidenza' });
  expect(reduced(list.querySelector('.item-row') as HTMLElement)).toBe(true);
});
