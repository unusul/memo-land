import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { UpdateBand, UpdatedBand, newVersion, startAppUpdates } from '../src/shell/appUpdate.js';
import type { Register } from '../src/shell/appUpdate.js';

/*
 * A new version of the app (user's choices, 2026-11-17): a band says it is there, with Aggiorna, and a tap loads it;
 * once loaded, a green band in the same place says it for six seconds, with a line running down and a ×. First the
 * note was the toast at the bottom: «molto brutto». Before, the service worker took the new version in the background and
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
  expect(newVersion('0.5.0', '2026-11-17T10:00:00+01:00')).toBeNull();
  expect(newVersion('0.5.0', '2026-11-17T10:00:00+01:00')).toBeNull();
  expect(newVersion('0.5.1', '2026-11-17T12:00:00+01:00')).toBe('0.5.1');
  expect(newVersion('0.5.1', '2026-11-17T12:00:00+01:00')).toBeNull();
});

/** The green band says the version, goes by itself after six seconds, or at once with its ×. */
test('testUpdatedBandShowsAndGoes', () => {
  vi.useFakeTimers();
  try {
    localStorage.setItem('attivita:seen-build', 'older|build');
    const { unmount } = render(<UpdatedBand />);
    expect(screen.getByRole('status').textContent).toMatch(/^Aggiornata alla \d/);
    act(() => { vi.advanceTimersByTime(6000); });
    expect(screen.queryByRole('status')).toBeNull();
    unmount();
    localStorage.setItem('attivita:seen-build', 'older|build');
    render(<UpdatedBand />);
    fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
    expect(screen.queryByRole('status')).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
