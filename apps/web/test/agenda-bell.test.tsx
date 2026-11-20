import { screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import type { AgendaItem } from '@attivita/core';
import { AgendaView, rowAlerted } from '../src/agenda/AgendaView.js';
import { setActivityAlert } from '../src/groups/barPrefs.js';
import { PIPPO, PLUTO, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => localStorage.clear());

const time = (over: Partial<AgendaItem> = {}): AgendaItem =>
  ({ activityId: 's', groupId: 'inv:developers', title: 'Turno', start: '2026-11-21T18:45', ...over }) as AgendaItem;
const atStart = { mode: 'here' as const, list: [{ of: 'start' as const, before: 0 }] };

/**
 * The bell of a row (user's request, 2026-11-20) follows the server: only with alerts set, only for the times «Per chi»
 * lets through (with «Solo mia», the one taken by the person and not the others of the series), not on a time done,
 * skipped or moved away.
 */
test('testRowAlertedFollowsTheBellAndWho', () => {
  expect(rowAlerted(time({ assignee: PIPPO }), PIPPO)).toBe(false);
  setActivityAlert(PIPPO, 's', atStart);
  expect(rowAlerted(time({ assignee: PLUTO }), PIPPO)).toBe(true);
  setActivityAlert(PIPPO, 's', { ...atStart, who: 'mine' });
  expect(rowAlerted(time({ assignee: PIPPO }), PIPPO)).toBe(true);
  expect(rowAlerted(time({ assignee: PLUTO }), PIPPO)).toBe(false);
  expect(rowAlerted(time(), PIPPO)).toBe(false);
  setActivityAlert(PIPPO, 's', { ...atStart, who: 'mineOrNobody' });
  expect(rowAlerted(time(), PIPPO)).toBe(true);
  expect(rowAlerted(time({ assignee: PIPPO, done: true } as Partial<AgendaItem>), PIPPO)).toBe(false);
  expect(rowAlerted(time({ assignee: PIPPO, skipped: true } as Partial<AgendaItem>), PIPPO)).toBe(false);
  expect(rowAlerted(time({ assignee: PIPPO, movedTo: '2026-11-22T18:45' } as Partial<AgendaItem>), PIPPO)).toBe(false);
});

/** In the agenda: «Controllo backup» is Pippo's and rings with «Solo mia»; «Stato avanzamento» is nobody's and does not. */
test('testTheBellShowsAfterTheTitle', async () => {
  setActivityAlert(PIPPO, 'backup', { ...atStart, who: 'mine' });
  setActivityAlert(PIPPO, 'sal', { ...atStart, who: 'mine' });
  renderWithSession(<AgendaView onOpen={() => undefined} />, memorySession());
  await screen.findAllByText('Controllo backup');
  const rings = (title: string) => screen.getAllByText(title).map(t => t.closest('.item')?.querySelector('.row-bell') !== null);
  expect(rings('Controllo backup').every(Boolean)).toBe(true);
  expect(rings('Stato avanzamento').some(Boolean)).toBe(false);
});
