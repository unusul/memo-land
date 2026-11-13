import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

const durations = () => within(screen.getByRole('group', { name: 'Durata' }));
const stored = async (s: ReturnType<typeof memorySession>, id: string) => (await s.primary.getActivity(id)).activity.props.schedule;

/** Under the time an optional duration: none, 30 minutes, an hour, two hours, or an end of one's own. */
test('testDurationShortcutSetsTheEnd', async () => {
  const s = await open('sal', 'Stato avanzamento');
  userClick('Modifica Data e ora');
  expect((screen.getByLabelText('Fine') as HTMLInputElement).value).toBe('15:45');
  fireEvent.click(durations().getByRole('button', { name: '1 ora' }));
  expect((screen.getByLabelText('Fine') as HTMLInputElement).value).toBe('16:00');
  userClick('Salva');
  await waitFor(async () => expect(await stored(s, 'sal')).toEqual({ start: '2026-11-01T15:00', end: '2026-11-01T16:00' }));
});

test('testNoDurationLeavesOnlyTheStart', async () => {
  const s = await open('sal', 'Stato avanzamento');
  userClick('Modifica Data e ora');
  fireEvent.click(durations().getByRole('button', { name: 'nessuna' }));
  expect(durations().getByRole('button', { name: 'nessuna' }).getAttribute('aria-pressed')).toBe('true');
  userClick('Salva');
  await waitFor(async () => expect(await stored(s, 'sal')).toEqual({ start: '2026-11-01T15:00' }));
});

test('testAnEndOfOnesOwn', async () => {
  const s = await open('costi', 'Analisi costi');
  userClick('+ Data e ora');
  pickDate('Data e ora', '2026-11-20');
  userType(screen.getByLabelText('Ora'), '10:00');
  expect(durations().getByRole('button', { name: 'nessuna' }).getAttribute('aria-pressed')).toBe('true');
  userType(screen.getByLabelText('Fine'), '12:30');
  userClick('Aggiungi');
  await waitFor(async () => expect(await stored(s, 'costi')).toEqual({ start: '2026-11-20T10:00', end: '2026-11-20T12:30' }));
});
