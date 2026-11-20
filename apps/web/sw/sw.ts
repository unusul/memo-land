/// <reference lib="webworker" />
// The app's service worker, written by us since 2026-11-19 (vite-plugin-pwa, injectManifest): the push of the alerts
// needs its own events. Before, the plugin generated it (generateSW). It keeps what that one did: the app precached
// for use without network, every page served by index.html, old caches cleared, a new version waiting for Aggiorna
// (SKIP_WAITING). Workbox is bundled inside this file: no importScripts (the 0.18.0 bug).
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: Array<{ url: string; revision: string | null } | string> };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Every page is the app, but the Vault's test of the device key (prf-test.html, 2026-11-20), a page of its own.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/\/prf-test\.html$/] }));

// Aggiorna in the app's band (shell/appUpdate.tsx, through virtual:pwa-register).
self.addEventListener('message', event => {
  if ((event.data as { type?: string } | null)?.type === 'SKIP_WAITING') void self.skipWaiting();
});

/** What alerts-tick sends: the title, «tra 15 minuti · 18:45–19:30 · Casa», and the activity it is about. */
interface AlertPush { title?: string; body?: string; activityId?: string; occurrence?: string }

self.addEventListener('push', event => {
  let data: AlertPush = {};
  try { data = (event.data?.json() ?? {}) as AlertPush; } catch { data = { body: event.data?.text() ?? '' }; }
  const options: NotificationOptions = {
    body: data.body ?? '',
    icon: 'icon-192.png',
    // One notification per alert of one occurrence: a second one with the same tag replaces it.
    tag: data.activityId ? `${data.activityId}|${data.occurrence ?? ''}` : 'memo-land',
    data: { activityId: data.activityId, occurrence: data.occurrence },
  };
  event.waitUntil(self.registration.showNotification(data.title ?? 'memo-land', options));
});

/** A tap opens the activity: in the app already open, by a message (shell/notificationTap.ts), or in a new window. */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { activityId, occurrence } = (event.notification.data ?? {}) as AlertPush;
  const url = new URL('./', self.registration.scope);
  if (activityId) url.searchParams.set('activity', activityId);
  if (activityId && occurrence) url.searchParams.set('occurrence', occurrence);
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = open.find(c => c.url.startsWith(self.registration.scope));
    if (app) {
      await app.focus();
      if (activityId) app.postMessage({ type: 'open-activity', activityId, occurrence });
      return;
    }
    await self.clients.openWindow(url.href);
  })());
});
