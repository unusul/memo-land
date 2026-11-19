import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { archive } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { CaptureSheet } from '../src/capture/CaptureSheet.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeEach(() => {
  // jsdom has no object URLs: the previews of the attachments ask for one.
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.restoreAllMocks());

const picker = (kind: 'camera' | 'gallery' | 'file') => document.querySelector(`input[data-picker="${kind}"]`) as HTMLInputElement;
const pick = (kind: 'camera' | 'gallery' | 'file', file: File) => fireEvent.change(picker(kind), { target: { files: [file] } });
const stored = async (s: ReturnType<typeof memorySession>, id = 'idea') => (await s.primary.getActivity(id)).activity;

/** As in a notes app: the camera straight away, only images (Android opens the photo gallery), or any file. */
test('testAttachOpensAMenuOfCameraImageAndFile', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  const button = await screen.findByRole('button', { name: '+ Allega' });
  expect(button.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(button);
  const menu = screen.getByRole('menu', { name: 'Allega' });
  expect(within(menu).getAllByRole('menuitem').map(b => b.textContent)).toEqual(['Scatta una foto', "Scegli un'immagine", 'Incolla dagli appunti', 'Allega un file']);
  expect(picker('camera').getAttribute('accept')).toBe('image/*');
  expect(picker('camera').getAttribute('capture')).toBe('environment');
  expect(picker('gallery').getAttribute('accept')).toBe('image/*');
  expect(picker('gallery').multiple).toBe(true);
  expect(picker('file').hasAttribute('accept')).toBe(false);
  expect(picker('file').multiple).toBe(true);
});

test('testMenuItemOpensItsPickerAndCloses', async () => {
  const clicked: string[] = [];
  vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) { clicked.push(this.dataset.picker ?? ''); });
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  fireEvent.click(await screen.findByRole('button', { name: '+ Allega' }));
  fireEvent.click(screen.getByRole('menuitem', { name: "Scegli un'immagine" }));
  expect(clicked).toEqual(['gallery']);
  expect(screen.queryByRole('menu')).toBeNull();
});

test('testEscapeClosesTheMenu', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  fireEvent.click(await screen.findByRole('button', { name: '+ Allega' }));
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
  expect(screen.queryByRole('menu')).toBeNull();
});

/** Until now files went only on a new activity; an existing one gets them added after those it has. */
test('testPickedImageIsAddedToAnExistingActivity', async () => {
  const s = memorySession();
  const ref = await s.primary.putAttachment('idea', { name: 'prima.png', mimeType: 'image/png', bytes: PNG });
  const before = await stored(s);
  await s.primary.saveActivity({ ...before, attachments: [ref] }, before.version);
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('button', { name: '+ Allega' });
  pick('gallery', new File([PNG], 'foto.png', { type: 'image/png' }));
  await waitFor(async () => expect((await stored(s)).attachments.map(f => f.name)).toEqual(['prima.png', 'foto.png']));
  expect(await screen.findByRole('img', { name: 'foto.png' })).toBeTruthy();
});

/** Someone else changed the activity meanwhile: their change stays, the file is added on top of it. */
test('testAttachKeepsAChangeMadeMeanwhile', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('button', { name: '+ Allega' });
  const now = await stored(s);
  await s.primary.saveActivity({ ...now, body: 'cambiato altrove' }, now.version);
  pick('file', new File([new Uint8Array([1, 2, 3])], 'conto.pdf', { type: 'application/pdf' }));
  await waitFor(async () => expect((await stored(s)).attachments.map(f => f.name)).toEqual(['conto.pdf']));
  expect((await stored(s)).body).toBe('cambiato altrove');
});

test('testOversizeFileIsNotAddedToAnExistingActivity', async () => {
  const s = memorySession(undefined, { maxAttachmentBytes: 5 });
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('button', { name: '+ Allega' });
  pick('file', new File([new Uint8Array(10)], 'grande.bin', { type: 'application/octet-stream' }));
  expect(await screen.findByText(/grande\.bin è troppo grande/)).toBeTruthy();
  expect((await stored(s)).attachments).toEqual([]);
});

test('testReadOnlyActivityHasNoAttach', async () => {
  const s = memorySession();
  const now = await stored(s);
  await s.primary.saveActivity(archive(now, PIPPO, '2026-11-13T10:00:00Z'), now.version);
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  expect(screen.queryByRole('button', { name: '+ Allega' })).toBeNull();
});

test('testQuickCaptureUsesTheSameMenu', async () => {
  renderWithSession(<CaptureSheet onSaved={vi.fn()} onClose={vi.fn()} shrink={async f => f} />, memorySession());
  fireEvent.click(screen.getByRole('button', { name: '+ Allega' }));
  expect(within(screen.getByRole('menu')).getAllByRole('menuitem')).toHaveLength(4);
  pick('camera', new File([PNG], 'scatto.jpg', { type: 'image/jpeg' }));
  expect(await screen.findByText('scatto.jpg')).toBeTruthy();
});

/** The device's clipboard as the browser gives it: `read` resolves with these items, or fails as a denied permission. */
function clipboardWith(items: { type: string; bytes: Uint8Array<ArrayBuffer> }[] | 'denied') {
  const read = items === 'denied' ? vi.fn(() => Promise.reject(new DOMException('denied', 'NotAllowedError')))
    : vi.fn(() => Promise.resolve(items.map(it => ({ types: [it.type], getType: () => Promise.resolve(new Blob([it.bytes], { type: it.type })) }))));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { read } });
}

const pasteFromMenu = async () => {
  fireEvent.click(await screen.findByRole('button', { name: '+ Allega' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Incolla dagli appunti' }));
};

/**
 * «Incolla dagli appunti» (user's choice, 2026-11-19): on a phone the detail has no field to paste into, so before an
 * image on the clipboard could go only into a new draft; now it goes into an existing activity from the menu.
 */
test('testPasteFromTheMenuAddsTheClipboardImage', async () => {
  clipboardWith([{ type: 'text/plain', bytes: new Uint8Array([65]) }, { type: 'image/png', bytes: PNG }]);
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await pasteFromMenu();
  await waitFor(async () => expect((await stored(s)).attachments.map(f => f.name)).toEqual(['appunti.png']));
});

/** Without an image, or with a clipboard the browser does not give, the menu says so and nothing is added. */
test('testPasteFromTheMenuSaysWhyNothingCame', async () => {
  clipboardWith([{ type: 'text/plain', bytes: new Uint8Array([65]) }]);
  const s = memorySession();
  const { unmount } = renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await pasteFromMenu();
  expect(await screen.findByText("Negli appunti non c'è un'immagine.")).toBeTruthy();
  unmount();
  clipboardWith('denied');
  renderWithSession(<CaptureSheet onSaved={vi.fn()} onClose={vi.fn()} shrink={async f => f} />, memorySession());
  await pasteFromMenu();
  expect(await screen.findByText(/Non riesco a leggere gli appunti/)).toBeTruthy();
  expect((await stored(s)).attachments).toEqual([]);
});
