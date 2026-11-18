import { useSyncExternalStore } from 'react';
import type { AccountId, ActivityId, GroupId } from '@attivita/core';
import { alertsOf, clipsOf, expandedOf, highlightsOf, iconsOf, namesOf, onBarPrefsChange, pinsOf, reducedOf, setAlerts, setClips, setExpanded, setHighlights, setIcons, setNames, setPins, setReduced } from '../groups/barPrefs.js';
import type { ActivityAlert, Clip } from '../groups/barPrefs.js';
import type { GroupIconName } from '../shell/icons.js';
import { loadTheme, onThemeChange, saveTheme } from './theme.js';
import type { Theme } from './theme.js';

/** What follows the account from one device to another: the bar, the groups' icons, the theme, what is «In evidenza». */
export interface SyncedPrefs {
  pins: GroupId[]; icons: Record<GroupId, GroupIconName>; theme: Theme; highlights: ActivityId[];
  /** «Sempre espansa» (2026-11-16); absent in prefs saved before it. */
  expanded?: ActivityId[];
  /** «Sempre ridotta» (2026-11-17); absent in prefs saved before it. */
  reduced?: ActivityId[];
  /** «Appunti» (2026-11-18); absent in prefs saved before them. */
  clips?: Clip[];
  /** The names given to people, by account (2026-11-18); absent in prefs saved before them. */
  names?: Record<AccountId, string>;
  /** The person's own alerts for some activities (2026-11-18); absent in prefs saved before them. */
  alerts?: Record<ActivityId, ActivityAlert>;
}
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
/** One subscription for every render, as useBarPrefs. */
const watch = (w: () => void) => { watchers.add(w); return () => { watchers.delete(w); }; };
/** Re-renders the caller when the sync status changes. */
export const useSyncStatus = (): SyncStatus => useSyncExternalStore(watch, () => status);

const collect = (account: AccountId): SyncedPrefs => ({ pins: pinsOf(account), icons: iconsOf(account), theme: loadTheme(), highlights: highlightsOf(account), expanded: expandedOf(account), reduced: reducedOf(account), clips: clipsOf(account), names: namesOf(account), alerts: alertsOf(account) });
const hhmm = (d = new Date()) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const failed = () => setStatus({ state: 'failed', offline: !navigator.onLine });
/** How often the account's copy is read again while the app is in sight. */
const REFRESH_MS = 60_000;

/**
 * Keeps the browser's copy of the prefs and the account's in step. When the app opens the account's copy wins; an
 * account with none gets this browser's (the first device loses nothing). Each change is sent a moment later, once for
 * a burst. Offline, or with the server down, the browser's copy goes on working and the settings say it was not saved,
 * with Riprova. Returns the way to stop.
 * Before, the prefs lived only in the browser, and the phone and the computer each had their own (2026-11-13).
 */
export function startPrefsSync(account: AccountId, store: PrefsStore, delayMs = 1500, refreshMs = REFRESH_MS): () => void {
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
  const apply = (remote: Partial<SyncedPrefs>) => {
    applying = true;
    try {
      if (remote.pins) setPins(account, remote.pins);
      if (remote.icons) setIcons(account, remote.icons);
      if (remote.theme) saveTheme(remote.theme);
      if (remote.highlights) setHighlights(account, remote.highlights);
      if (remote.expanded) setExpanded(account, remote.expanded);
      if (remote.reduced) setReduced(account, remote.reduced);
      if (remote.clips) setClips(account, remote.clips);
      if (remote.names) setNames(account, remote.names);
      if (remote.alerts) setAlerts(account, remote.alerts);
    } finally {
      applying = false;
    }
  };
  store.load().then(remote => {
    if (stopped) return;
    if (!remote) { send(); return; }
    apply(remote);
    setStatus({ state: 'saved' });
  }, () => { if (!stopped) failed(); });
  // The account's copy again when the app comes back in sight, and every minute while it is (user's bug, 2026-11-18: a
  // clip saved on the phone showed on the computer only after a reload). Not while this device's own change waits to
  // be sent: it would be overwritten.
  const pull = () => {
    if (stopped || document.visibilityState !== 'visible' || status.state === 'pending') return;
    store.load().then(remote => { if (!stopped && remote && status.state !== 'pending') apply(remote); }, () => undefined);
  };
  const onVisible = () => pull();
  document.addEventListener('visibilitychange', onVisible);
  const every = setInterval(pull, refreshMs);
  return () => {
    stopped = true; clearTimeout(timer); clearInterval(every); document.removeEventListener('visibilitychange', onVisible);
    offBar(); offTheme(); retry = null; setStatus({ state: 'off' });
  };
}
