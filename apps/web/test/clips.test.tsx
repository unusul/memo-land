import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { CaptureSheet } from '../src/capture/CaptureSheet.js';
import { sharedText } from '../src/capture/shared.js';
import { ClipsSection } from '../src/clips/ClipsSection.js';
import { deviceKind } from '../src/clips/device.js';
import { addClip, clipsOf } from '../src/groups/barPrefs.js';
import { ToastHost } from '../src/shell/toast.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

/*
 * «Appunti» (user's choices, 2026-11-17): pressing + the field stays empty and the clipboard is offered under it, with
 * «Usa» (into the field) and «Da appunti» (kept at once); not offered again once used or saved. In Io, above the drafts,
 * the clips, the newest first, «oggi 10:42 · telefono»; a tap copies; each goes by itself after 7 days. Condividi on
 * Android opens the capture with what was shared in the field.
 */

let clipboard = '';
beforeEach(() => {
  localStorage.clear();
  clipboard = '';
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: vi.fn(async () => clipboard), writeText: vi.fn(async (t: string) => { clipboard = t; }) },
  });
});
afterEach(() => vi.restoreAllMocks());

const capture = () => renderWithSession(<ToastHost><CaptureSheet onSaved={vi.fn()} onClose={vi.fn()} shrink={async f => f} /></ToastHost>, memorySession(PIPPO));

test('testTheClipboardIsOfferedUnderAnEmptyField', async () => {
  clipboard = 'https://esempio.it/ricetta';
  capture();
  const offer = await screen.findByRole('group', { name: 'Dagli appunti' });
  expect(offer.textContent).toContain('https://esempio.it/ricetta');
  expect((screen.getByLabelText('Idea') as HTMLTextAreaElement).value).toBe('');
  fireEvent.click(within(offer).getByRole('button', { name: 'Usa' }));
  expect((screen.getByLabelText('Idea') as HTMLTextAreaElement).value).toBe('https://esempio.it/ricetta');
  expect(screen.queryByRole('group', { name: 'Dagli appunti' })).toBeNull();
});

test('testDaAppuntiKeepsItAndItIsNotOfferedAgain', async () => {
  clipboard = 'codice del cancello 4521';
  const view = capture();
  fireEvent.click(within(await screen.findByRole('group', { name: 'Dagli appunti' })).getByRole('button', { name: 'Da appunti' }));
  expect(clipsOf(PIPPO).map(c => c.text)).toEqual(['codice del cancello 4521']);
  expect(screen.getByRole('status').textContent).toMatch(/Salvato in Appunti/);
  view.unmount();
  capture();
  await new Promise(r => setTimeout(r, 20));
  expect(screen.queryByRole('group', { name: 'Dagli appunti' })).toBeNull();
});

test('testClipsInIoNewestFirstAndATapCopies', async () => {
  const now = Date.now();
  addClip(PIPPO, { id: 'old', text: 'vecchio', at: new Date(now - 8 * 86_400_000).toISOString(), from: 'computer' });
  addClip(PIPPO, { id: 'a', text: 'primo', at: new Date(now - 6 * 86_400_000).toISOString(), from: 'computer' });
  addClip(PIPPO, { id: 'b', text: 'secondo', at: new Date(now).toISOString(), from: 'telefono' });
  renderWithSession(<ToastHost><ClipsSection /></ToastHost>, memorySession(PIPPO));
  const list = screen.getByRole('list', { name: 'Appunti' });
  const rows = [...list.querySelectorAll('.item')].map(i => [i.querySelector('.t')?.textContent, i.querySelector('.meta')?.textContent]);
  // The one of 8 days ago is gone; the one of 6 days ago says it goes soon.
  expect(rows.map(r => r[0])).toEqual(['secondo', 'primo']);
  expect(rows[0]![1]).toMatch(/^oggi \d\d:\d\d · telefono$/);
  expect(rows[1]![1]).toMatch(/· computer · sparisce domani$/);
  fireEvent.click(within(list).getByRole('button', { name: /Copia secondo/ }));
  await waitFor(() => expect(clipboard).toBe('secondo'));
  expect(await screen.findByText('Copiato')).toBeTruthy();
});

test('testWhatIsSharedComesInTheField', () => {
  expect(sharedText(new URLSearchParams('title=Ricetta&text=https%3A%2F%2Fx.it&url=https%3A%2F%2Fx.it'))).toBe('Ricetta\nhttps://x.it');
  expect(sharedText(new URLSearchParams('capture=1'))).toBeUndefined();
  renderWithSession(<CaptureSheet onSaved={vi.fn()} onClose={vi.fn()} shared={'Ricetta\nhttps://x.it'} />, memorySession(PIPPO));
  expect((screen.getByLabelText('Idea') as HTMLTextAreaElement).value).toBe('Ricetta\nhttps://x.it');
  expect(screen.getByRole('button', { name: 'Da appunti' })).toBeTruthy();
});

test('testTheDeviceIsNamedFromItsBrowser', () => {
  expect(deviceKind('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('telefono');
  expect(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('telefono');
  expect(deviceKind('Mozilla/5.0 (Linux; Android 14; SM-X710) Safari')).toBe('tablet');
  expect(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130')).toBe('computer');
});
