import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { complete } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { isCollapsed, toggleCollapsed } from '../src/groups/barPrefs.js';
import { PIPPO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

/*
 * Rows reduced and expanded in the Agenda (user's choices, 2026-11-16): a done, skipped or moved-away time is shown
 * on one lower line, title on the left and time on the right; an open one in full; a small arrow switches each row for
 * as long as the app stays open. «Sempre ridotta», the person's own like the star, keeps an activity reduced.
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

test('testADoneTimeIsReducedAndAnOpenOneExpanded', async () => {
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [done, open] = await rows();
  expect(reduced(done!)).toBe(true);
  expect(done!.querySelector('.meta')).toBeNull();
  expect(done!.querySelector('.time')?.textContent).toBe('09:00–09:30');
  expect(reduced(open!)).toBe(false);
  expect(open!.querySelector('.meta')).not.toBeNull();
});

/** The arrow switches the row both ways. */
test('testTheArrowExpandsAndReduces', async () => {
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [done, open] = await rows();
  const expand = within(done!).getByRole('button', { name: 'Espandi Controllo backup' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(expand);
  await waitFor(() => expect(reduced(done!)).toBe(false));
  fireEvent.click(within(open!).getByRole('button', { name: 'Riduci Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(true));
});

/** «Sempre ridotta» in the detail, beside «Si chiude da sola»: the person's own, kept in their prefs. */
test('testAlwaysReducedFromTheDetail', async () => {
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, bench());
  await screen.findByRole('heading', { name: 'Controllo backup' });
  const sw = screen.getByRole('button', { name: 'Sempre ridotta' });
  expect(sw.previousElementSibling?.getAttribute('aria-label')).toBe('Si chiude da sola');
  fireEvent.click(sw);
  expect(isCollapsed(PIPPO, 'backup')).toBe(true);
  expect(screen.getByRole('button', { name: 'Sempre ridotta' }).getAttribute('aria-pressed')).toBe('true');
});

/** Always reduced, an open time is reduced too; the arrow still expands it. */
test('testAlwaysReducedRowsStartReduced', async () => {
  toggleCollapsed(PIPPO, 'backup');
  renderWithSession(<AgendaView from="2026-11-03" days={3} onOpen={() => undefined} />, bench());
  const [, open] = await rows();
  expect(reduced(open!)).toBe(true);
  fireEvent.click(within(open!).getByRole('button', { name: 'Espandi Controllo backup' }));
  await waitFor(() => expect(reduced(open!)).toBe(false));
});
