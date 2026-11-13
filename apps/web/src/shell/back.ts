import { useEffect, useRef } from 'react';

/**
 * The phone's back button, through the browser history. Each open layer (an activity, the new draft's sheet, a group's
 * page, a section other than the agenda) holds one history entry; back closes the innermost layer, as its own close
 * button would. With every layer closed, back leaves the app as before.
 *
 * Layers also close from the app (Chiudi, a tab): their entries are then taken back without running any handler. The
 * entries are matched to the layers a moment later, not at once, so a layer that closes and reopens in the same moment
 * (React's StrictMode, a re-render) leaves the history as it was.
 */
type Layer = { back(): void };
const layers: Layer[] = [];
let entries = 0;
let ignore = 0;
let pending = false;

function reconcile(): void {
  pending = false;
  if (entries < layers.length) {
    for (; entries < layers.length; entries++) window.history.pushState({ memoLand: entries + 1 }, '');
  } else if (entries > layers.length) {
    ignore++;
    window.history.go(layers.length - entries);
    entries = layers.length;
  }
}

function schedule(): void {
  if (pending) return;
  pending = true;
  setTimeout(reconcile, 0);
}

function onPopState(): void {
  if (ignore > 0) { ignore--; return; }
  if (entries === 0) return;
  entries--;
  layers.pop()?.back();
}

if (typeof window !== 'undefined') window.addEventListener('popstate', onPopState);

/** While `open`, back runs `onBack` (which should close the layer) instead of leaving the screen. */
export function useBackLayer(open: boolean, onBack: () => void): void {
  const handler = useRef(onBack);
  handler.current = onBack;
  useEffect(() => {
    if (!open) return;
    const layer: Layer = { back: () => handler.current() };
    layers.push(layer);
    schedule();
    return () => {
      const i = layers.indexOf(layer);
      if (i >= 0) { layers.splice(i, 1); schedule(); }
    };
  }, [open]);
}
