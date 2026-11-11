import { useSyncExternalStore } from 'react';
import type { AccountId, Group, GroupId } from '@attivita/core';
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

/** Re-renders the caller when pins or icons change, in this tab. */
export function useBarPrefs(): number {
  return useSyncExternalStore(l => { listeners.add(l); return () => listeners.delete(l); }, () => version);
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
  return groups.filter(g => g.kind !== 'personal').sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name, 'it'));
}
