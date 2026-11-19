import { beforeEach, expect, test, vi } from 'vitest';

/*
 * The service worker is ours since 2026-11-19 (sw/sw.ts, injectManifest), for the push of the alerts. Before, the
 * plugin generated it (generateSW): the published sw.js precached the app, cleared old caches, served every page with
 * /memo-land/index.html and skipped waiting at Aggiorna's SKIP_WAITING, with nothing else. Compared on 2026-11-19 with
 * a build of this one: the same 13 files and the same four things; the push and the tap are the only additions. These
 * tests are the net for that: going back to generateSW would lose the push, which needs its own events.
 */

const workbox = vi.hoisted(() => ({
  precacheAndRoute: vi.fn(), cleanupOutdatedCaches: vi.fn(), createHandlerBoundToURL: vi.fn((u: string) => `handler:${u}`),
  registerRoute: vi.fn(), NavigationRoute: vi.fn(function (this: { handler: unknown }, h: unknown) { this.handler = h; }),
}));
vi.mock('workbox-precaching', () => ({ precacheAndRoute: workbox.precacheAndRoute, cleanupOutdatedCaches: workbox.cleanupOutdatedCaches, createHandlerBoundToURL: workbox.createHandlerBoundToURL }));
vi.mock('workbox-routing', () => ({ registerRoute: workbox.registerRoute, NavigationRoute: workbox.NavigationRoute }));

type Listener = (e: Record<string, unknown>) => void;
const listeners: Record<string, Listener> = {};
const shown: Array<{ title: string; options: NotificationOptions }> = [];
const posted: unknown[] = [];
const opened: string[] = [];
let windows: Array<{ url: string; focus(): Promise<void>; postMessage(m: unknown): void }> = [];
const skipWaiting = vi.fn(async () => undefined);

beforeEach(async () => {
  vi.resetModules();
  shown.length = 0; posted.length = 0; opened.length = 0; windows = [];
  vi.stubGlobal('self', {
    __WB_MANIFEST: [{ url: 'index.html', revision: '1' }],
    registration: { scope: 'https://unusul.github.io/memo-land/', showNotification: async (title: string, options: NotificationOptions) => { shown.push({ title, options }); } },
    clients: { matchAll: async () => windows, openWindow: async (u: string) => { opened.push(u); } },
    skipWaiting,
    addEventListener: (type: string, l: Listener) => { listeners[type] = l; },
  });
  const path = '../sw/sw.ts';
  await import(/* @vite-ignore */ path);
});

/** An event that collects what it waits for, as the browser keeps the worker alive until it ends. */
async function fire(type: string, fields: Record<string, unknown>) {
  const waits: Array<Promise<unknown>> = [];
  listeners[type]!({ ...fields, waitUntil: (p: Promise<unknown>) => waits.push(p) });
  await Promise.all(waits);
}

test('testTheWorkerKeepsWhatTheGeneratedOneDid', async () => {
  expect(workbox.precacheAndRoute).toHaveBeenCalledWith([{ url: 'index.html', revision: '1' }]);
  expect(workbox.cleanupOutdatedCaches).toHaveBeenCalled();
  expect(workbox.createHandlerBoundToURL).toHaveBeenCalledWith('index.html');
  expect(workbox.registerRoute).toHaveBeenCalledWith(expect.objectContaining({ handler: 'handler:index.html' }));
  await fire('message', { data: { type: 'SKIP_WAITING' } });
  expect(skipWaiting).toHaveBeenCalledTimes(1);
});

/** An alert from alerts-tick: its title and words, one notification per alert of one occurrence. */
test('testAPushShowsTheAlert', async () => {
  const payload = { title: 'Riunione', body: 'tra 15 minuti · 18:45–19:30 · Casa', activityId: 'riunione', occurrence: '2026-11-20T18:45' };
  await fire('push', { data: { json: () => payload, text: () => JSON.stringify(payload) } });
  expect(shown).toEqual([{ title: 'Riunione', options: expect.objectContaining({ body: 'tra 15 minuti · 18:45–19:30 · Casa', tag: 'riunione|2026-11-20T18:45', data: { activityId: 'riunione', occurrence: '2026-11-20T18:45' } }) }]);
});

/** A tap: the app already open gets the activity by a message; without it, a window opens on its address. */
test('testATapOpensTheActivity', async () => {
  const notification = { close: vi.fn(), data: { activityId: 'riunione', occurrence: '2026-11-20T18:45' } };
  await fire('notificationclick', { notification });
  expect(opened).toEqual(['https://unusul.github.io/memo-land/?activity=riunione&occurrence=2026-11-20T18%3A45']);
  const focus = vi.fn(async () => undefined);
  windows = [{ url: 'https://unusul.github.io/memo-land/', focus, postMessage: (m: unknown) => posted.push(m) }];
  await fire('notificationclick', { notification });
  expect(focus).toHaveBeenCalled();
  expect(posted).toEqual([{ type: 'open-activity', activityId: 'riunione', occurrence: '2026-11-20T18:45' }]);
  expect(notification.close).toHaveBeenCalledTimes(2);
});
