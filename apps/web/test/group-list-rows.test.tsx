import { screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import { GroupList } from '../src/groups/GroupsView.js';
import { PIPPO, PLUTO, memorySession, renderWithSession } from './memory-session.js';

/*
 * The rows of a group's list say what the Agenda says (user's choices, 2026-11-17): the date as «17 nov» or «19 nov
 * 09:00», whose it is under the title, «alta», «info» in grey, a series' rhythm; an idea nobody has stays on one line.
 * Before, a row had only its title and the date as the engine keeps it, «2026-11-17».
 */

const T0 = '2026-11-01T08:00:00Z';
const group: Group = { id: 'inv:casa', kind: 'invite', name: 'Casa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner', [PLUTO]: 'member' }, version: 1 };
const personal: Group = { id: `personal:${PIPPO}`, kind: 'personal', name: 'Personale', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 };
const mk = (id: string, title: string, extra: Partial<Activity> = {}, groupId = group.id): Activity =>
  ({ ...newActivity({ id, accountId: PIPPO, title, groupId }, T0), ...extra });

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-11-05T08:00')); });
afterEach(() => { vi.useRealTimers(); });

const row = (title: string) => screen.getByText(title).closest('.item') as HTMLElement;
const meta = (title: string) => row(title).querySelector('.meta')?.textContent ?? null;
const when = (title: string) => row(title).querySelector('.time')?.textContent;

test('testGroupRowsSayWhoseAndWhen', () => {
  renderWithSession(<GroupList label="Casa" group={group} onOpen={() => undefined} activities={[
    mk('diff', 'Portare fuori la differenziata', { props: { due: '2026-11-17', assignment: { state: 'proposed', assignee: PIPPO, assignedBy: PLUTO } } }),
    mk('mensola', 'Riparare la mensola', { props: { due: '2026-11-22', priority: 'high' } }),
    mk('pacco', 'Ritirare il pacco', { props: { due: '2026-11-03', assignment: { state: 'accepted', assignee: PIPPO, assignedBy: PIPPO } } }),
    mk('pulizie', 'Pulizie di casa', { props: { schedule: { start: '2026-11-05T09:00' }, repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY' },
      assignment: { state: 'accepted', assignee: PLUTO, assignedBy: PLUTO } } }),
    mk('vacanze', 'Prenotare le vacanze'),
  ]} />, memorySession());
  expect(meta('Portare fuori la differenziata')).toBe('proposta a te da pluto');
  expect(when('Portare fuori la differenziata')).toBe('17 nov');
  expect(meta('Riparare la mensola')).toBe('libera');
  expect(row('Riparare la mensola').querySelector('.pill.high')?.textContent).toBe('alta');
  // Past, a task still says its day.
  expect(meta('Ritirare il pacco')).toBe('tu');
  expect(when('Ritirare il pacco')).toBe('3 nov');
  expect(meta('Pulizie di casa')).toBe('pluto · ogni settimana');
  expect(when('Pulizie di casa')).toBe('5 nov 09:00');
  expect(meta('Prenotare le vacanze')).toBeNull();
  expect(when('Prenotare le vacanze')).toBe('');
});

/** An information is grey with its label and does not say whose it is; in Personale nobody else can take anything. */
test('testInformationAndPersonalRows', () => {
  renderWithSession(<GroupList label="Casa" group={group} onOpen={() => undefined} activities={[
    mk('scuola', 'Scuola chiusa per il ponte', { info: true, props: { due: '2026-12-08' } }),
  ]} />, memorySession());
  expect(row('Scuola chiusa per il ponte').classList.contains('info')).toBe(true);
  expect(row('Scuola chiusa per il ponte').querySelector('.pill.info')?.textContent).toBe('info');
  expect(meta('Scuola chiusa per il ponte')).toBeNull();
  expect(when('Scuola chiusa per il ponte')).toBe('8 dic');
});

test('testPersonalRowsDoNotSayWhose', () => {
  renderWithSession(<GroupList label="Personale" group={personal} onOpen={() => undefined} activities={[
    mk('palestra', 'Palestra', { props: { due: '2026-11-10' } }, personal.id),
  ]} />, memorySession());
  expect(meta('Palestra')).toBeNull();
  expect(when('Palestra')).toBe('10 nov');
});
