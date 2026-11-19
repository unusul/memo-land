import type { SupabaseClient } from '@supabase/supabase-js';
import type { Alert, AlertChoice } from './alerts.js';

/** Where the person stands with Telegram: the bot set up or not, its name, a chat tied, the alerts chosen. */
export interface TelegramStatus extends AlertChoice { configured: boolean; bot: string | null; linked: boolean }

/**
 * The server side of the Telegram alerts (migration 0009): the account's link, its choices and the queue of alerts the
 * server sends. Only the central engine's session has one; elsewhere (the demo) the settings do not show the section.
 */
export interface TelegramStore {
  status(): Promise<TelegramStatus>;
  /** A code for t.me/<bot>?start=<code>, valid 15 minutes; null when the bot is not set up. */
  linkCode(): Promise<{ code: string; bot: string } | null>;
  setAlerts(choice: AlertChoice): Promise<void>;
  unlink(): Promise<void>;
  /** The alerts not sent yet become these; returns how many the server kept. */
  replaceQueue(alerts: Alert[]): Promise<number>;
}

export const telegramLink = (bot: string, code: string): string => `https://t.me/${bot}?start=${code}`;

/**
 * Telegram in the demo (user's request, 2026-11-19): a chat already tied to a bot that sends nothing, so the bell,
 * Prossime notifiche and Manda una prova can be seen without a server.
 */
export function demoTelegram(): TelegramStore {
  return {
    status: async () => ({ configured: true, bot: 'memo_land_bot', linked: true, start: false, end: false }),
    linkCode: async () => null,
    setAlerts: async () => undefined,
    unlink: async () => undefined,
    replaceQueue: async alerts => alerts.length,
  };
}

export function supabaseTelegram(db: SupabaseClient): TelegramStore {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw error;
    return data as T;
  };
  return {
    status: () => call<TelegramStatus>('telegram_status'),
    linkCode: () => call<{ code: string; bot: string } | null>('telegram_link_code'),
    setAlerts: c => call<void>('telegram_set_alerts', { on_start: c.start, on_end: c.end }),
    unlink: () => call<void>('telegram_unlink'),
    replaceQueue: alerts => call<number>('telegram_replace_queue', { items: alerts }),
  };
}
