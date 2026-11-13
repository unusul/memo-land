import { useSyncExternalStore } from 'react';
import type { AccountId, GroupId } from '@attivita/core';
import { iconsOf, onBarPrefsChange, pinsOf, setIcons, setPins } from '../groups/barPrefs.js';
import type { GroupIconName } from '../shell/icons.js';
import { loadTheme, onThemeChange, saveTheme } from './theme.js';
import type { Theme } from './theme.js';

/** What follows the account from one device to another: the bar, the groups' icons, the theme. */
export interface SyncedPrefs { pins: GroupId[]; icons: Record<GroupId, GroupIconName>; theme: Theme }
/** Where the account keeps them (on the central engine, the account's metadata). */
export interface PrefsStore { load(): Promise<Partial<SyncedPrefs> | null>; save(p: SyncedPrefs): Promise<void> }

/** Where the sync stands, for the settings: `at` is the local time of the last save that went through. */
export interface SyncStatus { state: 'off' | 'pending' | 'saved' | 'failed'; at?: string; offline?: boolean }

let status: SyncStatus = { state: 'off' };
let retry: (() => void) | null = null;
const watchers = new Set<() => void>();
const setStatus = (next: SyncStatus) => { status = next; watchers.forEach(w => w()); };
export const syncStatus = (): SyncStatus => status;
/** Sends the prefs again now, after a failure. */
export const retryPrefsSync = (): void => retry?.();
/** Re-renders the caller when the sync status changes. */
export const useSyncStatus = (): SyncStatus => useSyncExternalStore(w => { watchers.add(w); return () => watchers.delete(w); }, () => status);

const collect = (account: AccountId): SyncedPrefs => ({ pins: pinsOf(account), icons: iconsOf(account), theme: loadTheme() });
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const failed = () => setStatus({ state: 'failed', offline: !navigator.onLine });

/**
 * Keeps the browser's copy of the prefs and the account's in step. When the app opens the account's copy wins; an
 * account with none gets this browser's (the first device loses nothing). Each change is sent a moment later, once for
 * a burst. Offline, or with the server down, the browser's copy goes on working and the settings say it was not saved,
 * with Riprova. Returns the way to stop.
 * Before, the prefs lived only in the browser, and the phone and the computer each had their own (2026-11-13).
 */
export function startPrefsSync(account: AccountId, store: PrefsStore, delayMs = 1500): () => void {
  let stopped = false;
  let applying = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const saveNow = () => {
    store.save(collect(account)).then(() => { if (!stopped) setStatus({ state: 'saved', at: hhmm() }); }, () => { if (!stopped) failed(); });
  };
  const send = () => {
    if (stopped || applying) return;
    clearTimeout(timer);
    setStatus({ state: 'pending' });
    timer = setTimeout(saveNow, delayMs);
  };
  retry = () => { if (!stopped) { clearTimeout(timer); setStatus({ state: 'pending' }); saveNow(); } };
  const offBar = onBarPrefsChange(send);
  const offTheme = onThemeChange(send);
  store.load().then(remote => {
    if (stopped) return;
    if (!remote) { send(); return; }
    applying = true;
    try {
      if (remote.pins) setPins(account, remote.pins);
      if (remote.icons) setIcons(account, remote.icons);
      if (remote.theme) saveTheme(remote.theme);
    } finally {
      applying = false;
    }
    setStatus({ state: 'saved' });
  }, () => { if (!stopped) failed(); });
  return () => { stopped = true; clearTimeout(timer); offBar(); offTheme(); retry = null; setStatus({ state: 'off' }); };
}
