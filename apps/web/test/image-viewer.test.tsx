import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

/*
 * An image opens large over the page, inside the app (user's bug, 2026-11-18): the thumbnail was a link to a new
 * window, and the app installed on a computer sent it to the browser. x or Esc close it.
 */

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:foto'), revokeObjectURL: vi.fn() }));
});
afterEach(() => vi.unstubAllGlobals());

test('testAnImageOpensInTheAppAndCloses', async () => {
  const s = memorySession(PIPPO);
  const ref = await s.primary.putAttachment('backup', { name: 'foto.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
  const a = (await s.primary.getActivity('backup')).activity;
  await s.primary.saveActivity({ ...a, attachments: [ref] }, a.version);
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  const thumb = await screen.findByRole('button', { name: 'Apri foto.png' });
  expect(thumb.closest('a')).toBeNull();
  fireEvent.click(thumb);
  const viewer = screen.getByRole('dialog', { name: 'foto.png' });
  expect(viewer.querySelector('img')?.getAttribute('src')).toBe('blob:foto');
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('dialog', { name: 'foto.png' })).toBeNull();
  fireEvent.click(thumb);
  fireEvent.keyDown(document.body, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'foto.png' })).toBeNull());
});

/** Who edits the activity takes an attachment away with the x beside it (user's choice, 2026-11-18). */
test('testAnAttachmentIsTakenAway', async () => {
  const s = memorySession(PIPPO);
  const ref = await s.primary.putAttachment('backup', { name: 'foto.png', mimeType: 'image/png', bytes: new Uint8Array([1, 2, 3]) });
  const a = (await s.primary.getActivity('backup')).activity;
  await s.primary.saveActivity({ ...a, attachments: [ref] }, a.version);
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Togli foto.png' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.attachments).toEqual([]));
  expect(screen.queryByRole('button', { name: 'Apri foto.png' })).toBeNull();
});
