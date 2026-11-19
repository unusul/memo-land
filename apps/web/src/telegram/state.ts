import { useSyncExternalStore } from 'react';
import type { TelegramStatus, TelegramStore } from './store.js';

/**
 * Where the person stands with Telegram, shared by the settings and by the bell: read when
 * the app opens and after each change made from the settings. `undefined` while not read yet, `null` when it failed.
 */
let current: TelegramStatus | null | undefined;
const watchers = new Set<() => void>();
const set = (next: TelegramStatus | null | undefined) => { current = next; watchers.forEach(w => w()); };
const watch = (w: () => void) => { watchers.add(w); return () => { watchers.delete(w); }; };

export const useTelegramStatus = (): TelegramStatus | null | undefined => useSyncExternalStore(watch, () => current);

export async function refreshTelegram(store: TelegramStore): Promise<void> {
  try { set(await store.status()); } catch { set(null); }
}

/** Telegram counts as on with the bot set up, its chat tied and its switch not off (0010). */
export const telegramOn = (s: TelegramStatus | null | undefined): boolean => s?.configured === true && s.linked && s.on !== false;

/** Forgets it, for a test or another account. */
export const resetTelegram = (): void => set(undefined);
