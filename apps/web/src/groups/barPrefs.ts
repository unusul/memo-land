import { useSyncExternalStore } from 'react';
import type { AccountId, ActivityId, Group, GroupId } from '@attivita/core';
import { topChoices } from '../usage/choicesStore.js';
import type { GroupIconName } from '../shell/icons.js';

/**
 * The person's choices about the menu, per account in this browser: the pinned groups in their order and the icon of
 * each group. They move to the person's engine data with the "persona" piece (spec §7).
 */
export const MAX_PINS = 3;
/** Groups in the menu on wide screens; phones show the first MAX_PINS. */
export const MENU_GROUPS = 5;

const pinsKey = (account: AccountId) => `attivita:pins:${account}`;
const iconsKey = (account: AccountId) => `attivita:group-icons:${account}`;

const listeners = new Set<() => void>();
let version = 0;
const changed = () => { version++; listeners.forEach(l => l()); };

function read<T>(key: string, empty: T): T {
  try {
    return (JSON.parse(localStorage.getItem(key) ?? 'null') as T | null) ?? empty;
  } catch {
    return empty;
  }
}

function write(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable: the bar falls back to the most used */ }
  changed();
}

export const pinsOf = (account: AccountId): GroupId[] => read<GroupId[]>(pinsKey(account), []);
export const setPins = (account: AccountId, pins: GroupId[]): void => write(pinsKey(account), pins);

/** False when the bar is full: the person must unpin one first. */
export function pin(account: AccountId, id: GroupId): boolean {
  const pins = pinsOf(account);
  if (pins.includes(id)) return true;
  if (pins.length >= MAX_PINS) return false;
  setPins(account, [...pins, id]);
  return true;
}

export const unpin = (account: AccountId, id: GroupId): void => setPins(account, pinsOf(account).filter(p => p !== id));

/** Moves a pinned group one place up (-1) or down (+1); at either end nothing changes. */
export function movePin(account: AccountId, id: GroupId, step: -1 | 1): void {
  const pins = pinsOf(account);
  const from = pins.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= pins.length) return;
  [pins[from], pins[to]] = [pins[to]!, pins[from]!];
  setPins(account, pins);
}

export const iconOf = (account: AccountId, id: GroupId): GroupIconName | null => read<Record<string, GroupIconName>>(iconsKey(account), {})[id] ?? null;

/** `null` goes back to the group's initial. */
export function setIcon(account: AccountId, id: GroupId, icon: GroupIconName | null): void {
  const icons = read<Record<string, GroupIconName>>(iconsKey(account), {});
  if (icon) icons[id] = icon; else delete icons[id];
  write(iconsKey(account), icons);
}

export const iconsOf = (account: AccountId): Record<GroupId, GroupIconName> => read<Record<string, GroupIconName>>(iconsKey(account), {});
/** Every icon at once: the account's copy, when the app opens on another device. */
export const setIcons = (account: AccountId, icons: Record<GroupId, GroupIconName>): void => write(iconsKey(account), icons);

const highlightsKey = (account: AccountId) => `attivita:highlights:${account}`;

/** What the person keeps «In evidenza», on top of the agenda: theirs only, in the order they put it there. */
export const highlightsOf = (account: AccountId): ActivityId[] => read<ActivityId[]>(highlightsKey(account), []);
export const setHighlights = (account: AccountId, ids: ActivityId[]): void => write(highlightsKey(account), ids);
export const isHighlighted = (account: AccountId, id: ActivityId): boolean => highlightsOf(account).includes(id);

export function toggleHighlight(account: AccountId, id: ActivityId): void {
  const ids = highlightsOf(account);
  setHighlights(account, ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
}

const expandedKey = (account: AccountId) => `attivita:expanded:${account}`;
/**
 * «Sempre espansa» (2026-11-16): the activities the person keeps in full in the Agenda, where every row starts reduced;
 * theirs only, like the star. It took the place of «Sempre ridotta» when the user chose all rows reduced at first.
 */
export const expandedOf = (account: AccountId): ActivityId[] => read<ActivityId[]>(expandedKey(account), []);
export const setExpanded = (account: AccountId, ids: ActivityId[]): void => write(expandedKey(account), ids);
const reducedKey = (account: AccountId) => `attivita:reduced:${account}`;
/** «Sempre ridotta» (2026-11-17): the activities the person keeps on one line, in the days and in the sections above. */
export const reducedOf = (account: AccountId): ActivityId[] => read<ActivityId[]>(reducedKey(account), []);
export const setReduced = (account: AccountId, ids: ActivityId[]): void => write(reducedKey(account), ids);

/**
 * How a row of the activity starts in the person's Agenda (user's choice, 2026-11-17): by the Agenda's own rules
 * («Automatica»), always in full, or always on one line. Before, a switch had only «Sempre espansa» on or off.
 */
export type RowSize = 'auto' | 'expanded' | 'reduced';
export const rowSizeOf = (account: AccountId, id: ActivityId): RowSize =>
  expandedOf(account).includes(id) ? 'expanded' : reducedOf(account).includes(id) ? 'reduced' : 'auto';

export function setRowSize(account: AccountId, id: ActivityId, size: RowSize): void {
  const others = (ids: ActivityId[]) => ids.filter(x => x !== id);
  setExpanded(account, size === 'expanded' ? [...others(expandedOf(account)), id] : others(expandedOf(account)));
  setReduced(account, size === 'reduced' ? [...others(reducedOf(account)), id] : others(reducedOf(account)));
}

/** Where a clip was saved from, as its row says: «oggi 10:42 · telefono». */
export type ClipFrom = 'telefono' | 'tablet' | 'computer';
/**
 * «Appunti» (user's choices, 2026-11-17): text copied on a device and kept for the person, the newest first, on every
 * device of the account. Text only, up to about 2,000 characters; each goes by itself after 7 days, unless made a draft.
 */
export interface Clip { id: string; text: string; at: string; from: ClipFrom }
export const CLIP_DAYS = 7;
export const MAX_CLIP_CHARS = 2000;
const clipsKey = (account: AccountId) => `attivita:clips:${account}`;
const fresh = (c: Clip, now: number) => now - Date.parse(c.at) < CLIP_DAYS * 86_400_000;
/** The clips still within their 7 days, the newest first. */
export const clipsOf = (account: AccountId, now = Date.now()): Clip[] =>
  read<Clip[]>(clipsKey(account), []).filter(c => fresh(c, now)).sort((x, y) => y.at.localeCompare(x.at));
/** Every clip at once, as the account keeps them: a gone one is written away for real. */
export const setClips = (account: AccountId, clips: Clip[]): void => write(clipsKey(account), clips.filter(c => fresh(c, Date.now())));
export function addClip(account: AccountId, clip: Clip): void {
  setClips(account, [{ ...clip, text: clip.text.slice(0, MAX_CLIP_CHARS) }, ...clipsOf(account)]);
}
export const removeClip = (account: AccountId, id: string): void => setClips(account, clipsOf(account).filter(c => c.id !== id));

/**
 * The names the person gives to the people of their groups, by account: seen only by them, everywhere in the app
 * (user's choice, 2026-11-18). Without one, a person reads as their email before the @.
 */
const namesKey = (account: AccountId) => `attivita:names:${account}`;
export const namesOf = (account: AccountId): Record<AccountId, string> => read<Record<string, string>>(namesKey(account), {});
export const setNames = (account: AccountId, names: Record<AccountId, string>): void => write(namesKey(account), names);
/** An empty name takes the given one away. */
export function setName(account: AccountId, who: AccountId, name: string): void {
  const { [who]: _old, ...rest } = namesOf(account);
  setNames(account, name.trim() ? { ...rest, [who]: name.trim() } : rest);
}

/** Whose names the labels use: the signed-in account, set when the app opens. */
let viewer: AccountId | null = null;
let cached: { account: AccountId; version: number; names: Record<AccountId, string> } | null = null;
export const setNamesViewer = (account: AccountId | null): void => { viewer = account; };
/** The name the viewer gave `who`, if any; read again only after a change. */
export function chosenName(who: AccountId): string | undefined {
  if (viewer === null) return undefined;
  if (!cached || cached.account !== viewer || cached.version !== version) cached = { account: viewer, version, names: namesOf(viewer) };
  return cached.names[who];
}

/** Calls `listener` when pins, icons or highlights change, in this tab; returns the way to stop. */
export function onBarPrefsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** One subscription for every render: made anew at each render, React let go of the listener and took it again. */
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => version;

/** Re-renders the caller when pins or icons change, in this tab. */
export function useBarPrefs(): number {
  return useSyncExternalStore(subscribe, snapshot);
}

/** The shared groups (the personal one lives in Io): pinned in the person's order, then the most opened, then by name. */
export function orderSharedGroups(groups: Group[], account: AccountId): Group[] {
  const pins = pinsOf(account);
  const used = topChoices(account, 'group', Number.MAX_SAFE_INTEGER);
  const rank = (g: Group) => {
    const p = pins.indexOf(g.id);
    if (p >= 0) return p;
    const u = used.indexOf(g.id);
    return pins.length + (u >= 0 ? u : used.length);
  };
  return groups.filter(g => g.kind !== 'personal' && !g.archived).sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name, 'it'));
}
