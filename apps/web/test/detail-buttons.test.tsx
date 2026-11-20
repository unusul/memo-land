import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { ActivityDetail, mainFirst, primaryOf } from '../src/activity/ActivityDetail.js';
import { ToastHost } from '../src/shell/toast.js';
import { PLUTO, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => localStorage.clear());

/**
 * One action highlighted, never two (user's remark, 2026-11-20): «Accetta» where someone waits for an answer, otherwise
 * «Fatto». For a moment both were.
 */
test('testOneMainAction', () => {
  expect(primaryOf(['accept', 'reject', 'complete', 'archive'])).toBe('accept');
  expect(primaryOf(['complete', 'archive'])).toBe('complete');
  expect(primaryOf(['archive'])).toBeUndefined();
});

/** The highlighted action comes first (user's request, 2026-11-20): before, «Lascia…» came before «Fatto». */
test('testTheMainActionComesFirst', () => {
  expect(mainFirst(['release', 'complete', 'archive'])).toEqual(['complete', 'release', 'archive']);
  expect(mainFirst(['reject', 'accept', 'complete'])).toEqual(['accept', 'reject', 'complete']);
  expect(mainFirst(['archive', 'snooze'])).toEqual(['archive', 'snooze']);
});

test('testFattoIsTheMainActionOfItsPage', async () => {
  renderWithSession(<ActivityDetail activityId="sal" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'Stato avanzamento' });
  expect(screen.getByRole('button', { name: 'Fatto' }).className).toBe('btn primary');
  expect(screen.getByRole('button', { name: 'Archivia' }).className).toBe('btn');
});

/**
 * Archivia says what it did in the line at the bottom, with Annulla (user's request, 2026-11-20), as the agenda's swipes;
 * Annulla puts the activity back open, after the page closed.
 */
test('testAnActionCanBeTakenBack', async () => {
  const s = memorySession(PLUTO);
  let closed = false;
  renderWithSession(<ToastHost><ActivityDetail activityId="doc" onClose={() => { closed = true; }} /></ToastHost>, s);
  await screen.findByRole('heading', { name: 'Aggiornare la documentazione' });
  fireEvent.click(screen.getByRole('button', { name: 'Archivia' }));
  const line = (await screen.findByText('Archiviata')).closest('.toast') as HTMLElement;
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.status).toBe('archived'));
  expect(closed).toBe(true);
  fireEvent.click(within(line).getByRole('button', { name: 'Annulla' }));
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.status).toBe('open'));
});
