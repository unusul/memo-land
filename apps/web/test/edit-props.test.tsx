import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { newActivity } from '@attivita/core';
import type { Group } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { availableActions } from '../src/activity/actions.js';
import { specOf, toRepeat } from '../src/activity/timing.js';
import { PIPPO, memorySession, renderWithSession, userClick, userType, pickDate, pickDateTime, pickedDate } from './memory-session.js';

beforeEach(() => localStorage.clear());

async function open(id: string, title: string) {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId={id} onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: title });
  return s;
}

test('testClickingASetPropertyEditsIt', async () => {
  const s = await open('costi', 'Analisi costi');
  userClick('Modifica Scadenza');
  expect(pickedDate('Scadenza')).toBe('2026-11-06');
  pickDate('Scadenza', '2026-11-10');
  userClick('Salva');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.due).toBe('2026-11-10'));
});

test('testEditingTheScheduleKeepsItsDuration', async () => {
  const s = await open('sal', 'Stato avanzamento');
  userClick('Modifica Data e ora');
  expect(pickedDate('Data e ora')).toBe('2026-11-01');
  expect((screen.getByLabelText('Ora') as HTMLInputElement).value).toBe('15:00');
  pickDateTime('Data e ora', '2026-11-02T10:00');
  userClick('Salva');
  await waitFor(async () => expect((await s.primary.getActivity('sal')).activity.props.schedule)
    .toEqual({ start: '2026-11-02T10:00', end: '2026-11-02T10:45' }));
});

test('testRepeatFormOpensWithTheCurrentRule', async () => {
  const s = await open('backup', 'Controllo backup');
  userClick('Modifica Ripeti');
  expect((screen.getByLabelText('Ogni') as HTMLInputElement).value).toBe('1');
  expect((screen.getByLabelText('Unità di ripetizione') as HTMLSelectElement).value).toBe('week');
  const pressed = () => screen.getAllByRole('button', { pressed: true }).map(b => b.textContent);
  expect(pressed()).toEqual(['mar', 'gio']);
  userClick('gio');
  userClick('ven');
  userClick('Salva');
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.props.repeat)
    .toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,FR' }));
});

test('testEditingTheWaitingConditionKeepsTheMemo', async () => {
  const s = await open('doc', 'Aggiornare la documentazione');
  userClick('Modifica In attesa di…');
  const input = screen.getByLabelText('Condizione') as HTMLInputElement;
  expect(input.value).toBe('chiusura della ops 412');
  userType(input, 'chiusura della ops 413');
  userClick('Salva');
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.props.waitingFor)
    .toEqual({ condition: 'chiusura della ops 413' }));
});

test('testSpecOfReadsBackWhatToRepeatWrites', () => {
  const weekly = { mode: 'calendar', every: 2, unit: 'week', weekdays: ['MO', 'FR'], monthly: 'day' } as const;
  expect(specOf(toRepeat({ ...weekly, weekdays: [...weekly.weekdays] }, '2026-11-02'))).toEqual({ ...weekly, weekdays: ['MO', 'FR'] });
  expect(specOf({ mode: 'calendar', rrule: 'FREQ=MONTHLY;INTERVAL=3;BYDAY=-1MO' })).toMatchObject({ unit: 'month', every: 3, monthly: 'nth' });
  expect(specOf({ mode: 'fromCompletion', every: { unit: 'day', count: 3 } })).toMatchObject({ mode: 'fromCompletion', unit: 'day', every: 3 });
  expect(specOf({ mode: 'calendar', rrule: 'FREQ=HOURLY' })).toBeNull();
});

test('testNoClaimInThePersonalGroup', () => {
  const personal: Group = { id: `personal:${PIPPO}`, kind: 'personal', name: 'Personale', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 };
  const idea = newActivity({ id: 'i', accountId: PIPPO, title: 'idea', groupId: personal.id }, '2026-11-01T08:00:00Z');
  expect(availableActions(idea, null, personal, PIPPO)).not.toContain('claim');
});

test('testDateOfARepeatingActivityCannotBeRemoved', async () => {
  await open('backup', 'Controllo backup');
  expect(screen.queryByRole('button', { name: 'Togli Data e ora' })).toBeNull();
  expect(screen.getByText(/per toglierla, togli prima Ripeti/)).toBeTruthy();
  userClick('Togli Ripeti');
  expect(await screen.findByRole('button', { name: 'Togli Data e ora' })).toBeTruthy();
});
