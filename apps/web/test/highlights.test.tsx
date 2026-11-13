import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { archive } from '@attivita/core';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { CaptureSheet } from '../src/capture/CaptureSheet.js';
import { highlightsOf, setHighlights } from '../src/groups/barPrefs.js';
import { startPrefsSync } from '../src/settings/prefsSync.js';
import type { PrefsStore, SyncedPrefs } from '../src/settings/prefsSync.js';
import { PIPPO, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());

const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));

/** What the person keeps in view comes first in the agenda, above Scadute and Proposte a te; drafts too. */
test('testHighlightedActivitiesComeFirstInTheAgenda', async () => {
  setHighlights(PIPPO, ['costi', 'idea']);
  renderWithSession(<AgendaView onOpen={() => undefined} />, memorySession());
  const list = await screen.findByRole('list', { name: 'In evidenza' });
  expect(within(list).getAllByRole('button').map(b => b.querySelector('.t')?.textContent)).toEqual(['Analisi costi', 'app gestione core']);
  const headings = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent);
  expect(headings[0]).toBe('In evidenza');
});

test('testNothingHighlightedNoSection', async () => {
  renderWithSession(<AgendaView onOpen={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'In attesa' });
  expect(screen.queryByRole('list', { name: 'In evidenza' })).toBeNull();
});

/** Done or archived, an activity leaves by itself: the section does not fill up with closed things. */
test('testAClosedActivityLeavesTheHighlights', async () => {
  const s = memorySession();
  const { activity } = await s.primary.getActivity('idea');
  await s.primary.saveActivity(archive(activity, PIPPO, '2026-11-13T10:00:00Z'), activity.version);
  setHighlights(PIPPO, ['idea', 'costi']);
  renderWithSession(<AgendaView onOpen={() => undefined} />, s);
  const list = await screen.findByRole('list', { name: 'In evidenza' });
  expect(within(list).queryByText('app gestione core')).toBeNull();
  await waitFor(() => expect(highlightsOf(PIPPO)).toEqual(['costi']));
});

/** One button in the detail puts it in view and takes it away. */
test('testDetailButtonTogglesTheHighlight', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  const button = await screen.findByRole('button', { name: 'In evidenza' });
  expect(button.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(button);
  expect(highlightsOf(PIPPO)).toEqual(['idea']);
  expect(screen.getByRole('button', { name: 'In evidenza' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'In evidenza' }));
  expect(highlightsOf(PIPPO)).toEqual([]);
});

/** The quick capture saves the draft as Salva does, and puts it in view at once. */
test('testQuickCaptureSavesStraightIntoTheHighlights', async () => {
  const s = memorySession();
  const onSaved = vi.fn();
  renderWithSession(<CaptureSheet onSaved={onSaved} onClose={vi.fn()} shrink={async f => f} />, s);
  userType(screen.getByLabelText('Idea'), 'stampante epson');
  userClick('In evidenza');
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  await waitFor(async () => expect((await s.primary.listActivities(null)).map(a => a.title)).toContain('stampante epson'));
  const saved = (await s.primary.listActivities(null)).find(a => a.title === 'stampante epson')!;
  expect(highlightsOf(PIPPO)).toEqual([saved.id]);
});

/** They follow the account from one device to another, as the bar and the icons do. */
test('testHighlightsFollowTheAccount', async () => {
  const saved: SyncedPrefs[] = [];
  const store: PrefsStore = { load: async () => ({ highlights: ['costi'] }), save: async p => { saved.push(p); } };
  const stop = startPrefsSync(PIPPO, store, 10);
  await settle();
  expect(highlightsOf(PIPPO)).toEqual(['costi']);
  setHighlights(PIPPO, ['costi', 'idea']);
  await settle();
  expect(saved.at(-1)?.highlights).toEqual(['costi', 'idea']);
  stop();
});
