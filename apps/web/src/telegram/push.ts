import { useEffect, useSyncExternalStore } from 'react';
import type { TelegramStore } from './store.js';

/**
 * «Notifiche su questo dispositivo» (user's choices, 2026-11-19): the browser's push, sent by the server (alerts-tick)
 * with the app closed. On an iPhone only once the app is on the Home screen (iOS 16.4 and later); on Android in Chrome.
 * The key that identifies the server is public: VITE_VAPID_PUBLIC_KEY, set at build time.
 */
export type PushSupport = 'ok' | 'no-key' | 'install' | 'unsupported';

const VAPID_KEY = (import.meta.env['VITE_VAPID_PUBLIC_KEY'] as string | undefined) ?? '';

export function pushSupport(key = VAPID_KEY): PushSupport {
  if (!key) return 'no-key';
  const apple = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const installed = window.matchMedia?.('(display-mode: standalone)').matches === true;
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return apple && !installed ? 'install' : 'unsupported';
  }
  return 'ok';
}

/** This device's subscription, if it has one. */
async function current(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks the permission (only after a tap), subscribes this device and tells the server. */
export async function enablePush(store: TelegramStore, key = VAPID_KEY): Promise<void> {
  if (await Notification.requestPermission() !== 'granted') throw new Error('denied');
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(key) });
  const json = sub.toJSON();
  await store.subscribePush({ endpoint: sub.endpoint, p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' });
  setPushOn(true);
}

/** Unsubscribes this device, on the server and in the browser. */
export async function disablePush(store: TelegramStore): Promise<void> {
  const sub = await current();
  if (sub) {
    await store.unsubscribePush(sub.endpoint);
    await sub.unsubscribe();
  }
  setPushOn(false);
}

/**
 * Whether this device has the push on, shared by Impostazioni and the bell: undefined while not read yet. Read when
 * first asked, and set by the switch.
 */
let pushOn: boolean | undefined;
let reading = false;
const watchers = new Set<() => void>();
export const setPushOn = (on: boolean | undefined): void => { pushOn = on; watchers.forEach(w => w()); };
const watch = (w: () => void) => { watchers.add(w); return () => { watchers.delete(w); }; };

export function usePushOn(): boolean | undefined {
  const on = useSyncExternalStore(watch, () => pushOn);
  useEffect(() => {
    if (pushOn !== undefined || reading) return;
    if (pushSupport() !== 'ok') { setPushOn(false); return; }
    reading = true;
    current().then(s => setPushOn(s !== null && Notification.permission === 'granted'), () => setPushOn(false)).finally(() => { reading = false; });
  }, []);
  return on;
}

/** The VAPID key as the push manager wants it. */
function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = (s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
