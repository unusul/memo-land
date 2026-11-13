import { fireEvent, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { newActivity } from '@attivita/core';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

const rowOf = (title: string) => screen.getAllByText(title)[0]!.closest('.item') as HTMLElement;

/**
 * The bar on the left keeps the group's colour in its top two thirds; its bottom third says at a glance whether the
 * occurrence is free (someone has to take it), taken by the person, or by someone else. The text stays as it was.
 */
test('testBottomBandSaysFreeMineOrTaken', async () => {
  renderWithSession(<AgendaView from="2026-11-02" days={14} onOpen={() => undefined} />, memorySession(PIPPO));
  await screen.findAllByText('Controllo backup');
  expect(rowOf('Controllo backup').dataset.take).toBe('mine');
  expect(rowOf('Stato avanzamento').dataset.take).toBe('free');
});

test('testSomeoneElsesOccurrenceIsTaken', async () => {
  renderWithSession(<AgendaView from="2026-11-02" days={14} onOpen={() => undefined} />, memorySession(PLUTO));
  await screen.findAllByText('Controllo backup');
  expect(rowOf('Controllo backup').dataset.take).toBe('other');
});

/** Nobody else can take what is in the personal group: no band, and no «libera» that says nothing. */
test('testPersonalGroupHasNoBandAndNoFree', async () => {
  const backend = benchBackend();
  backend.activities.set('palestra', newActivity({ id: 'palestra', accountId: PIPPO, title: 'Palestra', groupId: `personal:${PIPPO}` }, '2026-11-01T08:00:00Z'));
  backend.activities.get('palestra')!.props = { schedule: { start: '2026-11-03T18:30', end: '2026-11-03T19:30' } };
  renderWithSession(<AgendaView from="2026-11-02" days={14} onOpen={() => undefined} />, memorySession(PIPPO, {}, backend));
  const row = (await screen.findByText('Palestra')).closest('.item') as HTMLElement;
  expect(row.dataset.take).toBeUndefined();
  expect(within(row).getByText('Personale').textContent).toBe('Personale');
  expect(row.textContent).not.toMatch(/libera/);
});

/** An idea in the personal group goes to a group from its own button too, as a draft does, not only from «Dove». */
test('testPersonalIdeaHasMoveToAGroup', async () => {
  const backend = benchBackend();
  backend.activities.set('libro', newActivity({ id: 'libro', accountId: PIPPO, title: 'Leggere il libro', groupId: `personal:${PIPPO}` }, '2026-11-01T08:00:00Z'));
  renderWithSession(<ActivityDetail activityId="libro" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  fireEvent.click(await screen.findByRole('button', { name: 'Sposta in un gruppo' }));
  expect(screen.getByRole('button', { name: 'Modifica Dove' }).getAttribute('aria-expanded')).toBe('true');
});

/** Someone else's activity in a shared group: no such button (moving it is its author's). */
test('testSharedActivityOfAnotherHasNoMove', async () => {
  renderWithSession(<ActivityDetail activityId="doc" onClose={() => undefined} />, memorySession(PIPPO));
  await screen.findByRole('heading', { name: 'Aggiornare la documentazione' });
  expect(screen.queryByRole('button', { name: 'Sposta in un gruppo' })).toBeNull();
});
