import { screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { memorySession, pickDate, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());

async function open(id: string, title: string) {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId={id} onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: title });
  return s;
}

const words = () => screen.getByRole('group', { name: 'Durata' }).querySelector('.duration-words')?.textContent ?? null;
const stored = async (s: ReturnType<typeof memorySession>, id: string) => (await s.primary.getActivity(id)).activity.props.schedule;

/**
 * Under the time the end, written or chosen, and how long it lasts in words beside it (user's choice, 2026-11-20, after
 * Tempo). Before, four chips «nessuna», «30 min», «1 ora», «2 ore» set the end.
 */
test('testTheEndSaysHowLongItLasts', async () => {
  const s = await open('sal', 'Stato avanzamento');
  userClick('Modifica Data e ora');
  expect((screen.getByLabelText('Fine') as HTMLInputElement).value).toBe('15:45');
  expect(words()).toBe('45 min');
  userType(screen.getByLabelText('Fine'), '16:00');
  expect(words()).toBe('1 h');
  userClick('Applica');
  await waitFor(async () => expect(await stored(s, 'sal')).toEqual({ start: '2026-11-01T15:00', end: '2026-11-01T16:00' }));
});

test('testNoEndLeavesOnlyTheStart', async () => {
  const s = await open('sal', 'Stato avanzamento');
  userClick('Modifica Data e ora');
  userType(screen.getByLabelText('Fine'), '');
  expect(words()).toBeNull();
  userClick('Applica');
  await waitFor(async () => expect(await stored(s, 'sal')).toEqual({ start: '2026-11-01T15:00' }));
});

test('testAnEndOfOnesOwn', async () => {
  const s = await open('costi', 'Analisi costi');
  userClick('+ Data e ora');
  pickDate('Data e ora', '2026-11-20');
  userType(screen.getByLabelText('Ora'), '10:00');
  expect(words()).toBeNull();
  userType(screen.getByLabelText('Fine'), '12:30');
  expect(words()).toBe('2 h 30 min');
  userClick('Applica');
  await waitFor(async () => expect(await stored(s, 'costi')).toEqual({ start: '2026-11-20T10:00', end: '2026-11-20T12:30' }));
});
