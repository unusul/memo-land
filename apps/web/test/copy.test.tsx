import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { addItem, newActivity, toggleItem } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { activityText } from '../src/activity/copyText.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession, userClick } from './memory-session.js';

const T = '2026-11-02T08:00:00Z';
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  localStorage.clear();
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
});

function withList(title: string, body: string, items: string[], ticked: number[]): Activity {
  let a = newActivity({ id: 'riunione', accountId: PIPPO, title, groupId: null }, T);
  a = { ...a, body };
  for (const t of items) a = addItem(a, t, PIPPO, T);
  for (const n of ticked) a = toggleItem(a, a.checklist!.items[n]!.id, PIPPO, T);
  return a;
}

/** Title, text and the items still to do, one per line: what is copied is the activity's content, not its properties. */
test('testActivityTextKeepsTitleBodyAndItemsToDo', () => {
  const a = withList('  Riunione condominio ', 'Portare i preventivi\n', ['preventivo idraulico', 'sedie', 'preventivo tetto'], [1]);
  expect(activityText({ ...a, props: { due: '2026-11-21' } }))
    .toBe('Riunione condominio\nPortare i preventivi\n- preventivo idraulico\n- preventivo tetto');
});

/** Empty parts leave no blank lines: without a text there are the title and the items, without a list just the title. */
test('testActivityTextSkipsEmptyParts', () => {
  expect(activityText(withList('Spesa', '  ', ['latte'], []))).toBe('Spesa\n- latte');
  expect(activityText(withList('Chiamare Luca', '', [], []))).toBe('Chiamare Luca');
  expect(activityText(withList('Spesa', '', ['latte'], [0]))).toBe('Spesa');
});

test('testCopyFromDetailWritesTheClipboardAndSaysSo', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Copia il testo');
  expect(await screen.findByText('Copiata')).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith('app gestione core\nIdea avuta durante la corsa.');
});

/**
 * Some browsers deny the clipboard permission (the app's own preview pane does): the old copy command, from a hidden
 * field, still works there. Only when that fails too is the failure said.
 */
test('testCopyFallsBackWhenTheClipboardIsDenied', async () => {
  writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  let copied: string | null = null;
  document.execCommand = vi.fn(() => { copied = (document.activeElement as HTMLTextAreaElement).value; return true; });
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Copia il testo');
  expect(await screen.findByText('Copiata')).toBeTruthy();
  expect(copied).toBe('app gestione core\nIdea avuta durante la corsa.');
  expect(document.querySelector('textarea[readonly]')).toBeNull();
});

test('testCopyFailureIsSaid', async () => {
  writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
  document.execCommand = vi.fn(() => false);
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Copia il testo');
  expect(await screen.findByText('Non sono riuscito a copiare')).toBeTruthy();
});

/** A guest only reads, and copying changes nothing: the button is there for it too. */
test('testGuestCanCopy', async () => {
  const backend = benchBackend();
  const g: Group = { id: 'inv:x', kind: 'invite', type: 'activities', name: 'x', ownerId: PLUTO, timeZone: 'Europe/Rome', members: { [PLUTO]: 'owner', [PIPPO]: 'guest' }, version: 1 };
  backend.groups.set(g.id, g);
  backend.activities.set('riunione', { ...withList('Riunione', '', [], []), groupId: g.id, accountId: PLUTO });
  renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findByRole('heading', { name: 'Riunione' });
  userClick('Copia il testo');
  expect(await screen.findByText('Copiata')).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith('Riunione');
});

/** A new activity is not saved yet: nothing to copy. */
test('testNewActivityHasNoCopy', async () => {
  const fresh = newActivity({ id: 'n', accountId: PIPPO, title: '', groupId: `personal:${PIPPO}` }, T);
  renderWithSession(<ActivityDetail activityId="n" fresh={fresh} onClose={() => undefined} />, memorySession());
  await screen.findByLabelText('Titolo');
  expect(screen.queryByRole('button', { name: 'Copia il testo' })).toBeNull();
});

/** A list group's page has no Chiudi row: the button sits by the list's header. */
test('testListGroupCopiesFromTheListHeader', async () => {
  const backend = benchBackend();
  const spesa: Group = { id: 'inv:spesa', kind: 'invite', type: 'list', name: 'spesa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 };
  backend.groups.set(spesa.id, spesa);
  let a = newActivity({ id: 'inv:spesa#list', accountId: PIPPO, title: 'spesa', groupId: spesa.id }, T);
  a = addItem(addItem(a, 'latte', PIPPO, T), 'pane', PIPPO, T);
  a = toggleItem(a, a.checklist!.items[1]!.id, PIPPO, T);
  backend.activities.set(a.id, a);
  renderWithSession(<Shell />, memorySession(PIPPO, {}, backend));
  fireEvent.click(await within(await screen.findByRole('navigation', { name: 'Sezioni' })).findByRole('button', { name: /^spesa/ }));
  const list = await screen.findByRole('region', { name: 'Lista' });
  fireEvent.click(within(list).getByRole('button', { name: 'Copia il testo' }));
  expect(await screen.findByText('Copiata')).toBeTruthy();
  expect(writeText).toHaveBeenCalledWith('spesa\n- latte');
});

/** «Copiata» goes away by itself after a couple of seconds. */
test('testCopiedNoticeFades', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Copia il testo');
  await screen.findByText('Copiata');
  await waitFor(() => expect(screen.queryByText('Copiata')).toBeNull(), { timeout: 3000 });
});

/** Where the system can share (phones), Condividi opens its menu with the same text as Copia. */
test('testShareSendsTheSameText', async () => {
  const share = vi.fn(async (_: ShareData) => undefined);
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  try {
    renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
    await screen.findByRole('heading', { name: 'app gestione core' });
    userClick('Condividi');
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'app gestione core', text: 'app gestione core\nIdea avuta durante la corsa.' }));
    expect(screen.queryByText('Non sono riuscito a condividere')).toBeNull();
  } finally {
    delete (navigator as { share?: unknown }).share;
  }
});

/** Closing the system's menu without choosing is not a failure; another error is said. */
test('testShareCancelIsSilentOtherErrorsAreSaid', async () => {
  const share = vi.fn(async (_: ShareData) => { throw new DOMException('cancel', 'AbortError'); });
  Object.defineProperty(navigator, 'share', { value: share, configurable: true });
  try {
    renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
    await screen.findByRole('heading', { name: 'app gestione core' });
    userClick('Condividi');
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(screen.queryByText('Non sono riuscito a condividere')).toBeNull();
    share.mockImplementation(async () => { throw new DOMException('no', 'NotAllowedError'); });
    userClick('Condividi');
    expect(await screen.findByText('Non sono riuscito a condividere')).toBeTruthy();
  } finally {
    delete (navigator as { share?: unknown }).share;
  }
});

/** Without the system's sharing (most desktop browsers) there is no Condividi: Copia does the job. */
test('testNoShareWithoutTheSystemMenu', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  expect(screen.queryByRole('button', { name: 'Condividi' })).toBeNull();
});

/**
 * The top row: the way out on the left (an arrow, «Indietro», which saves as Chiudi did), what to do with the text on
 * the right, after the star «In evidenza». Before, a text link Chiudi sat beside the copy icon.
 */
test('testDetailTopRowBackLeftCopyRight', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  expect(screen.queryByRole('button', { name: 'Chiudi' })).toBeNull();
  const buttons = within(document.querySelector('.detail > header') as HTMLElement).getAllByRole('button').map(b => b.getAttribute('aria-label'));
  expect(buttons).toEqual(['Indietro', 'In evidenza', 'Copia il testo']);
});
