import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { EngineUnavailableError, InMemoryBackend, newActivity } from '@attivita/core';
import type { AttachmentRef, Engine, Group } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
let created: Blob[];

beforeEach(() => {
  created = [];
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn((b: Blob) => { created.push(b); return `blob:${created.length}`; });
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

async function attach(engine: Engine, activityId: string, name: string, mimeType: string, bytes: Uint8Array): Promise<AttachmentRef> {
  const ref = await engine.putAttachment(activityId, { name, mimeType, bytes });
  const { activity } = await engine.getActivity(activityId);
  await engine.saveActivity({ ...activity, attachments: [...activity.attachments, ref] }, activity.version);
  return ref;
}

test('testImageAttachmentShowsPreview', async () => {
  const s = memorySession();
  await attach(s.primary, 'idea', 'foto.png', 'image/png', PNG);
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  const img = await screen.findByRole('img', { name: 'foto.png' }) as HTMLImageElement;
  expect(img.getAttribute('src')).toBe('blob:1');
  expect(created[0]).toMatchObject({ size: PNG.byteLength, type: 'image/png' });
});

test('testFileAttachmentDownloadsOnClick', async () => {
  const s = memorySession();
  await attach(s.primary, 'idea', 'report.pdf', 'application/pdf', new Uint8Array([37, 80, 68, 70]));
  const clicked: HTMLAnchorElement[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicked.push(this); });
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Scarica report.pdf' }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(clicked[0]).toMatchObject({ download: 'report.pdf', href: 'blob:1' });
  expect(created[0]).toMatchObject({ size: 4, type: 'application/pdf' });
  expect(screen.queryByRole('img')).toBeNull();
});

test('testAttachmentIsReadFromTheEngineHoldingTheGroup', async () => {
  const famiglia: Group = { id: 'famiglia', kind: 'invite', name: 'famiglia', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 };
  const other = new InMemoryBackend();
  other.groups.set(famiglia.id, famiglia);
  other.activities.set('spesa', newActivity({ id: 'spesa', accountId: PIPPO, title: 'Fare la spesa', groupId: famiglia.id }, '2026-11-01T08:00:00Z'));
  const b = other.session(PIPPO);
  await attach(b, 'spesa', 'lista.png', 'image/png', PNG);
  const s = memorySession();
  const primaryRead = vi.spyOn(s.primary, 'getAttachment');
  renderWithSession(<ActivityDetail activityId="spesa" onClose={() => undefined} />, { ...s, engines: [s.primary, b] });
  expect(await screen.findByRole('img', { name: 'lista.png' })).toBeTruthy();
  expect(primaryRead).not.toHaveBeenCalled();
});

test('testUnreachableAttachmentShowsNotice', async () => {
  const s = memorySession();
  await attach(s.primary, 'idea', 'foto.png', 'image/png', PNG);
  vi.spyOn(s.primary, 'getAttachment').mockRejectedValue(new EngineUnavailableError('Failed to fetch'));
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  expect(await screen.findByText(/foto\.png: non si può aprire adesso/)).toBeTruthy();
  expect(screen.queryByRole('img')).toBeNull();
});
