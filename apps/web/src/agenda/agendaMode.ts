import { useSyncExternalStore } from 'react';
import { today } from '../dates.js';

/** The Agenda as the list of days or as the month: «Agenda | Calendario» in the header. */
export type AgendaMode = 'list' | 'month';

/**
 * The Calendar is a step inside the Agenda (user's choice, 2026-11-17): the app opens on the list, and swiping or going
 * back into the Agenda shows the list again; only «Calendario» in the header shows the month. So the mode lives only
 * while the app is open. Before, it was remembered and synced between devices with the person's prefs.
 */
let mode: AgendaMode = 'list';
/** The month the Calendar shows, `2026-11`: today's each time the Calendar opens; the header and the grid share it. */
let month = '';
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
const snapshot = () => mode;
const monthSnapshot = () => month;
const notify = () => listeners.forEach(l => l());

export const agendaMode = (): AgendaMode => mode;
export function setAgendaMode(next: AgendaMode): void {
  if (next === mode) return;
  mode = next;
  if (next === 'month') month = today().slice(0, 7);
  notify();
}
/** The mode now, re-rendering the caller when it changes. */
export const useAgendaMode = (): AgendaMode => useSyncExternalStore(subscribe, snapshot);

export function setShownMonth(next: string): void {
  if (next === month) return;
  month = next;
  notify();
}
/** The month the Calendar shows, re-rendering the caller when it turns. */
export const useShownMonth = (): string => useSyncExternalStore(subscribe, monthSnapshot);
