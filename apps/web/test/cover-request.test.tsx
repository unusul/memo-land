import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { askCover, coverAskOf } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView, clearFolds } from '../src/agenda/AgendaView.js';
import { ToastHost } from '../src/shell/toast.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

/*
 * «Copri tu questa» (user's choices, 2026-11-26): Controllo backup is Pippo's, on Tuesdays and Thursdays, in a group
 * with Pluto. Pippo asks Pluto to cover Thursday; Pluto finds it in «Proposte a te» and says yes, or no with an optional
 * reason, which Pippo then reads on the time.
 */

const THU = '2026-11-05T09:00';

beforeEach(() => { localStorage.clear(); clearFolds(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T08:00')); });
afterEach(() => vi.useRealTimers());

function askedBench() {
  const backend = benchBackend();
  const a = backend.activities.get('backup')!;
  backend.activities.set(a.id, askCover(a, THU, PLUTO, PIPPO, 'member', 'member', a.updatedAt));
  return backend;
}

test('testWhoHasTheTimeAsksAMember', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ToastHost><ActivityDetail activityId="backup" occurrenceKey={THU} onClose={() => undefined} /></ToastHost>, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Chiedi a qualcuno…' }));
  const choices = within(screen.getByRole('menu', { name: 'Chiedi a' })).getAllByRole('menuitemradio');
  fireEvent.click(choices.find(c => /pluto/i.test(c.textContent ?? ''))!);
  await waitFor(async () => expect(coverAskOf((await s.primary.getActivity('backup')).activity, THU)).toEqual({ to: PLUTO, by: PIPPO }));
  expect(await screen.findByText(/chiesta a/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ritira la richiesta' })).toBeTruthy();
});

test('testTheOneAskedFindsItInProposals', async () => {
  const s = memorySession(PLUTO, {}, askedBench());
  renderWithSession(<AgendaView from="2026-11-05" days={3} onOpen={() => undefined} />, s);
  const proposals = await screen.findByRole('list', { name: 'Proposte a te' });
  expect(within(proposals).getByText(/copri tu .*\? · da/)).toBeTruthy();
});

test('testTheOneAskedSaysYesOrNo', async () => {
  const backend = askedBench();
  const s = memorySession(PLUTO, {}, backend);
  const view = renderWithSession(<ToastHost><ActivityDetail activityId="backup" occurrenceKey={THU} onClose={() => undefined} /></ToastHost>, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Non posso…' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo' }), { target: { value: 'sono via' } });
  fireEvent.click(screen.getByRole('button', { name: 'Non posso' }));
  await waitFor(async () => expect(coverAskOf((await s.primary.getActivity('backup')).activity, THU)).toMatchObject({ refused: true, reason: 'sono via' }));
  view.unmount();
  // The asker reads it on the time.
  renderWithSession(<ToastHost><ActivityDetail activityId="backup" occurrenceKey={THU} onClose={() => undefined} /></ToastHost>, memorySession(PIPPO, {}, backend));
  expect(await screen.findByText(/non può: sono via/)).toBeTruthy();
});

test('testAcceptingCovers', async () => {
  const s = memorySession(PLUTO, {}, askedBench());
  renderWithSession(<ToastHost><ActivityDetail activityId="backup" occurrenceKey={THU} onClose={() => undefined} /></ToastHost>, s);
  fireEvent.click(await screen.findByRole('button', { name: 'La copro io' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.overrides[THU]).toEqual({ assignee: PLUTO, takenBy: PLUTO }));
});
