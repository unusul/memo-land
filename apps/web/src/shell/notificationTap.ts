import type { OpenTarget } from '../agenda/AgendaView.js';

/**
 * A tap on a notification (user's choice, 2026-11-19): it opens the activity it is about. The service worker opens the
 * app at «?activity=<id>&occurrence=<start>», or, with the app already open, focuses it and sends it the same two.
 */
export const OPEN_ACTIVITY = 'open-activity';

/** The activity a starting address names, or null. */
export function openedFrom(search: string): OpenTarget | null {
  const q = new URLSearchParams(search);
  const activityId = q.get('activity');
  if (!activityId) return null;
  const occurrenceKey = q.get('occurrence') ?? undefined;
  return occurrenceKey ? { activityId, occurrenceKey } : { activityId };
}

/** Calls `open` at each tap the service worker reports; returns the way to stop. */
export function onNotificationTap(open: (t: OpenTarget) => void): () => void {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!sw) return () => undefined;
  const listen = (e: MessageEvent) => {
    const d = e.data as { type?: string; activityId?: string; occurrence?: string } | null;
    if (d?.type === OPEN_ACTIVITY && d.activityId) open(d.occurrence ? { activityId: d.activityId, occurrenceKey: d.occurrence } : { activityId: d.activityId });
  };
  sw.addEventListener('message', listen);
  return () => sw.removeEventListener('message', listen);
}
