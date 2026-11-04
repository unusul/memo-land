import { screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { CaptureSheet } from '../src/capture/CaptureSheet.js';
import { fitWithin } from '../src/capture/images.js';
import { PIPPO, firePaste, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

const keep = async (f: File) => f;

test('testFitWithinKeepsRatioAndNeverEnlarges', () => {
  expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
  expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
});

test('testPastedImageBecomesAttachment', async () => {
  renderWithSession(<CaptureSheet onSaved={vi.fn()} onClose={vi.fn()} shrink={keep} />, memorySession());
  firePaste(screen.getByRole('dialog'), new File([new Uint8Array(10)], 'screenshot.png', { type: 'image/png' }));
  expect(await screen.findByText('screenshot.png')).toBeTruthy();
});

test('testOversizeAttachmentExplained', async () => {
  renderWithSession(<CaptureSheet onSaved={vi.fn()} onClose={vi.fn()} shrink={keep} />, memorySession(undefined, { maxAttachmentBytes: 5 }));
  firePaste(screen.getByRole('dialog'), new File([new Uint8Array(10)], 'big.bin', { type: 'application/octet-stream' }));
  expect(await screen.findByText(/supera/)).toBeTruthy();
  expect(screen.queryByText('big.bin')).toBeNull();
});

test('testSaveQueuesDraftThenSendsIt', async () => {
  const s = memorySession();
  const onSaved = vi.fn();
  renderWithSession(<CaptureSheet onSaved={onSaved} onClose={vi.fn()} shrink={keep} />, s);
  userType(screen.getByLabelText('Idea'), 'chiamare il fornitore');
  firePaste(screen.getByRole('dialog'), new File([new Uint8Array([1, 2, 3])], 'foto.jpg', { type: 'image/jpeg' }));
  await screen.findByText('foto.jpg');
  userClick('Salva');
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  await waitFor(async () => expect((await s.primary.listActivities(null)).map(a => a.title)).toContain('chiamare il fornitore'));
  const saved = (await s.primary.listActivities(null)).find(a => a.title === 'chiamare il fornitore')!;
  expect(saved.accountId).toBe(PIPPO);
  expect(saved.attachments.map(f => f.name)).toEqual(['foto.jpg']);
  expect(await s.outbox.list(PIPPO)).toEqual([]);
});
