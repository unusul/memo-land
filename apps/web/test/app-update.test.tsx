import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { UpdateBand, newVersionNote, startAppUpdates } from '../src/shell/appUpdate.js';
import type { Register } from '../src/shell/appUpdate.js';

/*
 * A new version of the app (user's choices, 2026-11-17): a band says it is there, with Aggiorna, and a tap loads it;
 * once loaded, a line says it for a few seconds. Before, the service worker took the new version in the background and
 * showed it only one or two reloads later, without a word.
 */

beforeEach(() => localStorage.clear());

/** A service worker with a version waiting: the band shows, Aggiorna takes it and reloads. */
test('testAWaitingVersionShowsAggiorna', () => {
  const update = vi.fn(async () => undefined);
  const register: Register = options => { options?.onNeedRefresh?.(); return update; };
  startAppUpdates(register);
  render(<UpdateBand />);
  expect(screen.getByRole('status').textContent).toContain("C'è una versione nuova");
  fireEvent.click(screen.getByRole('button', { name: 'Aggiorna' }));
  expect(update).toHaveBeenCalledWith(true);
});

test('testNoBandWithoutANewVersion', () => {
  startAppUpdates(() => async () => undefined);
  render(<UpdateBand />);
  expect(screen.queryByRole('button', { name: 'Aggiorna' })).toBeNull();
});

/** Said once, at the first opening of a new build; not at the very first opening, when there was nothing before. */
test('testNewVersionIsAnnouncedOnce', () => {
  expect(newVersionNote('0.5.0', '2026-11-17T10:00:00+01:00')).toBeNull();
  expect(newVersionNote('0.5.0', '2026-11-17T10:00:00+01:00')).toBeNull();
  expect(newVersionNote('0.5.1', '2026-11-17T12:00:00+01:00')).toBe('memo-land aggiornata alla versione 0.5.1');
  expect(newVersionNote('0.5.1', '2026-11-17T12:00:00+01:00')).toBeNull();
});
