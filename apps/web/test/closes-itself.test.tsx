import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { setClosesItself } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { historyText } from '../src/labels.js';
import { SessionHost } from '../src/session/SessionContext.js';
import { WorkspaceProvider } from '../src/workspace/useWorkspace.js';
import { useClosesItself } from '../src/workspace/closesItself.js';
import { benchBackend, memorySession, renderWithSession } from './memory-session.js';

/*
 * «Si chiude da sola» (user's choices, 2026-11-16): a switch before the star, only on activities with a date and time;
 * switched on, the app marks them done by itself at the end of their time when it is opened after it.
 */

beforeEach(() => localStorage.clear());

/**
 * The switch, in ⋯ (2026-11-19), on an activity with Data e ora; saved with the time it was switched on. Once on, its
 * icon shows lit in the top row too.
 */
test('testSwitchOnAnActivityWithATime', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Controllo backup' });
  expect(screen.queryByRole('button', { name: 'Si chiude da sola' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Altro' }));
  const sw = within(screen.getByRole('menu', { name: 'Altro' })).getByRole('button', { name: 'Si chiude da sola' });
  expect(sw.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(sw);
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.closesItself?.since).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/));
  await waitFor(() => expect(screen.getAllByRole('button', { name: 'Si chiude da sola' }).every(b => b.getAttribute('aria-pressed') === 'true')).toBe(true));
});

/** Without a time there is no moment to close at: no switch. */
test('testNoSwitchWithoutATime', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByDisplayValue('app gestione core');
  fireEvent.click(screen.getByRole('button', { name: 'Altro' }));
  expect(screen.queryByRole('button', { name: 'Si chiude da sola' })).toBeNull();
});

function Closer() { useClosesItself(); return null; }

/** Opened after the end of its time, the app marks it done by itself. */
test('testTheAppClosesItWhenOpenedAfterItsTime', async () => {
  const backend = benchBackend();
  const a = backend.activities.get('idea')!;
  const past = setClosesItself({ ...a, groupId: null, props: { schedule: { start: '2026-01-10T17:00' } } }, true, '2026-01-01T00:00', a.accountId, a.updatedAt);
  backend.activities.set(past.id, past);
  const s = memorySession(a.accountId, {}, backend);
  render(<SessionHost session={s}><WorkspaceProvider><Closer /></WorkspaceProvider></SessionHost>);
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.status).toBe('done'));
  const last = (await s.primary.getActivity('idea')).activity.history.at(-1)!;
  expect(historyText(last)).toBe('fatta da sola alle 17:00');
});
