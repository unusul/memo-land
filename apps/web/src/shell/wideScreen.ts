import { useSyncExternalStore } from 'react';

/** Where styles.css turns the sections' bar into the menu on the left. */
const WIDE = '(min-width: 900px)';
const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(WIDE) : null);
const subscribe = (l: () => void) => {
  const q = query();
  q?.addEventListener('change', l);
  return () => q?.removeEventListener('change', l);
};
const snapshot = () => query()?.matches ?? false;

/** Whether the screen is wide (a computer, a tablet across), re-rendering the caller when it changes. */
export const useWideScreen = (): boolean => useSyncExternalStore(subscribe, snapshot);
