import { beforeEach, expect, test, vi } from 'vitest';
import { iconOf, pinsOf, setIcon, setPins } from '../src/groups/barPrefs.js';
import { supabasePrefs } from '../src/session/central.js';
import { retryPrefsSync, startPrefsSync, syncStatus } from '../src/settings/prefsSync.js';
import type { PrefsStore, SyncedPrefs } from '../src/settings/prefsSync.js';
import { loadTheme, saveTheme } from '../src/settings/theme.js';

const ME = 'pippo@altereos.com';
const settle = (ms = 30) => new Promise(r => setTimeout(r, ms));

function store(onServer: Partial<SyncedPrefs> | null): PrefsStore & { saved: SyncedPrefs[] } {
  const saved: SyncedPrefs[] = [];
  return { saved, load: vi.fn(async () => onServer), save: vi.fn(async (p: SyncedPrefs) => { saved.push(p); }) };
}

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

/**
 * The bar, the groups' icons and the theme follow the account from one device to another. Before, they lived only in
 * the browser: the phone and the computer each had their own.
 */
test('testTheAccountsPrefsWinWhenTheAppOpens', async () => {
  setPins(ME, ['domain:altereos.com']);
  const s = store({ pins: ['inv:developers'], icons: { 'inv:developers': 'music' }, theme: 'dark' });
  const stop = startPrefsSync(ME, s, 10);
  await settle();
  expect(pinsOf(ME)).toEqual(['inv:developers']);
  expect(iconOf(ME, 'inv:developers')).toBe('music');
  expect(loadTheme()).toBe('dark');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(s.saved).toEqual([]);
  stop();
});

/** The first device to sync gives the account what it had in the browser, so nothing is lost. */
test('testAnEmptyAccountGetsThisBrowsersPrefs', async () => {
  setPins(ME, ['inv:developers']);
  setIcon(ME, 'inv:developers', 'music');
  const s = store(null);
  const stop = startPrefsSync(ME, s, 10);
  await settle();
  expect(s.saved).toEqual([{ pins: ['inv:developers'], icons: { 'inv:developers': 'music' }, theme: 'auto' }]);
  stop();
});

/** A change is sent a moment later, once for a burst of changes; after stop nothing more is sent. */
test('testChangesAreSentAMomentLater', async () => {
  const s = store({ pins: [] });
  const stop = startPrefsSync(ME, s, 10);
  await settle();
  setPins(ME, ['inv:developers']);
  setIcon(ME, 'inv:developers', 'music');
  saveTheme('light');
  await settle();
  expect(s.saved).toEqual([{ pins: ['inv:developers'], icons: { 'inv:developers': 'music' }, theme: 'light' }]);
  stop();
  setPins(ME, []);
  await settle();
  expect(s.saved).toHaveLength(1);
});

/** Offline, or with the server down, the browser's own prefs keep working: nothing is thrown. */
test('testAFailingStoreLeavesTheBrowsersPrefs', async () => {
  setPins(ME, ['inv:developers']);
  const s: PrefsStore = { load: async () => { throw new Error('offline'); }, save: async () => { throw new Error('offline'); } };
  const stop = startPrefsSync(ME, s, 10);
  await settle();
  setPins(ME, ['domain:altereos.com']);
  await settle();
  expect(pinsOf(ME)).toEqual(['domain:altereos.com']);
  stop();
});

/** On the central engine the prefs are the account's metadata, which the sign-in already keeps: no table of their own. */
test('testSupabasePrefsUseTheUsersMetadata', async () => {
  const updateUser = vi.fn(async () => ({ data: {}, error: null }));
  const db = { auth: { getUser: async () => ({ data: { user: { user_metadata: { memo_prefs: { pins: ['x'] } } } }, error: null }), updateUser } };
  const prefs = supabasePrefs(db as never);
  expect(await prefs.load()).toEqual({ pins: ['x'] });
  await prefs.save({ pins: ['y'], icons: {}, theme: 'auto' });
  expect(updateUser).toHaveBeenCalledWith({ data: { memo_prefs: { pins: ['y'], icons: {}, theme: 'auto' } } });
});

/** The settings say where the sync stands: waiting, saved (with the time), or failed with the way to try again. */
test('testSyncStatusAndRetry', async () => {
  let fail = true;
  const saved: SyncedPrefs[] = [];
  const s: PrefsStore = { load: async () => ({ pins: [] }), save: async p => { if (fail) throw new Error('offline'); saved.push(p); } };
  const stop = startPrefsSync(ME, s, 10);
  await settle();
  expect(syncStatus().state).toBe('saved');
  setPins(ME, ['inv:developers']);
  expect(syncStatus().state).toBe('pending');
  await settle();
  expect(syncStatus().state).toBe('failed');
  fail = false;
  retryPrefsSync();
  await settle();
  expect(syncStatus()).toMatchObject({ state: 'saved' });
  expect(syncStatus().at).toMatch(/^\d{2}:\d{2}$/);
  expect(saved).toHaveLength(1);
  stop();
});
