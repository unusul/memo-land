import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Where the person stands with Telegram: the bot set up or not, its name, a chat tied, and the channel's switch
 * (`on`, 2026-11-19; absent from a server before migration 0010, where it counts as on).
 */
export interface TelegramStatus { configured: boolean; bot: string | null; linked: boolean; on?: boolean }

/** A device that asked for the push, as the browser gives it (PushSubscription.toJSON). */
export interface PushKeys { endpoint: string; p256dh: string; auth: string }

/**
 * The server side of the alerts (migrations 0009, 0010): the account's Telegram link and switch, the devices with the
 * push, «Manda una prova». The server computes and sends the alerts itself (alerts-tick, 2026-11-19): before, the app
 * computed them and handed them here. Only the central engine's session has one; the demo has a pretend one.
 */
export interface TelegramStore {
  status(): Promise<TelegramStatus>;
  /** A code for t.me/<bot>?start=<code>, valid 15 minutes; null when the bot is not set up. */
  linkCode(): Promise<{ code: string; bot: string } | null>;
  /** The «Telegram» switch of Impostazioni → Avvisi. */
  setOn(on: boolean): Promise<void>;
  unlink(): Promise<void>;
  /** A message now on Telegram if on, a test push on each device within a minute: what was done. */
  test(): Promise<{ telegram: boolean; devices: number }>;
  subscribePush(keys: PushKeys): Promise<void>;
  unsubscribePush(endpoint: string): Promise<void>;
}

export const telegramLink = (bot: string, code: string): string => `https://t.me/${bot}?start=${code}`;

/**
 * Telegram in the demo (user's request, 2026-11-19): a chat already tied to a bot that sends nothing, so the bell,
 * Prossime notifiche and Manda una prova can be seen without a server.
 */
export function demoTelegram(): TelegramStore {
  let on = true;
  return {
    status: async () => ({ configured: true, bot: 'memo_land_bot', linked: true, on }),
    linkCode: async () => null,
    setOn: async v => { on = v; },
    unlink: async () => undefined,
    test: async () => ({ telegram: on, devices: 0 }),
    subscribePush: async () => undefined,
    unsubscribePush: async () => undefined,
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
    setOn: on => call<void>('telegram_set_on', { turned_on: on }),
    unlink: () => call<void>('telegram_unlink'),
    test: () => call<{ telegram: boolean; devices: number }>('alerts_test'),
    subscribePush: k => call<void>('push_subscribe', { endpoint: k.endpoint, p256dh: k.p256dh, auth: k.auth }),
    unsubscribePush: endpoint => call<void>('push_unsubscribe', { endpoint }),
  };
}
