import { useRef } from 'react';

/** Far enough sideways, and mostly sideways, to be a swipe and not a scroll. */
const MIN_PX = 80;
/** Android's back gesture starts at the screen's edges: a swipe from there is left to the system. */
const EDGE_PX = 24;
/** A swipe on any of these is theirs (a row's swipe, a field, a button), not the page's. */
const NOT_THE_PAGE = 'button, a, input, textarea, select, label, summary, .swipe, [role="radiogroup"]';

/**
 * Swiping the page moves between the sections in the bar's order: towards the left the next one, towards the right the
 * previous one. Only from an empty spot of the page and away from the screen's edges, as agreed with the person.
 */
export function useSectionSwipe(enabled: boolean, previous: (() => void) | null, next: (() => void) | null) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown(e: React.PointerEvent) {
      const fromEdge = e.clientX < EDGE_PX || e.clientX > window.innerWidth - EDGE_PX;
      const onSomething = (e.target as Element).closest?.(NOT_THE_PAGE);
      start.current = enabled && !fromEdge && !onSomething ? { x: e.clientX, y: e.clientY } : null;
    },
    onPointerUp(e: React.PointerEvent) {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (Math.abs(dx) < MIN_PX || Math.abs(dx) < Math.abs(dy) * 2) return;
      (dx < 0 ? next : previous)?.();
    },
    onPointerCancel() { start.current = null; },
  };
}
