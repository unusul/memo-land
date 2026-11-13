import { useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, PointerEvent, RefObject } from 'react';

interface Drag { id: string; from: number; to: number; dy: number; height: number }

/**
 * Reordering the rows of a list by a handle: the row follows the finger, the others make room, and on release the
 * row lands where it is shown. The arrow keys on the handle move it by one. The handle stops the pointer from reaching
 * the row's swipe, and only the rows' positions at the start are measured: the list does not change while dragging.
 */
export function useReorder(list: RefObject<HTMLElement | null>, move: (id: string, to: number) => void) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const start = useRef<{ y: number; mids: number[] } | null>(null);

  function down(e: PointerEvent, id: string, index: number) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    // The moves keep coming to the handle when the finger leaves it; a pointer the browser no longer knows refuses it.
    try { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); } catch { /* the drag still works under the finger */ }
    const rects = [...(list.current?.children ?? [])].map(c => c.getBoundingClientRect());
    start.current = { y: e.clientY, mids: rects.map(r => r.top + r.height / 2) };
    setDrag({ id, from: index, to: index, dy: 0, height: rects[index]?.height ?? 44 });
  }
  function over(e: PointerEvent) {
    const s = start.current;
    if (!s || !drag) return;
    const dy = e.clientY - s.y;
    const centre = s.mids[drag.from]! + dy;
    const to = s.mids.filter((m, k) => k !== drag.from && m < centre).length;
    setDrag({ ...drag, dy, to });
  }
  function up() {
    const d = drag;
    start.current = null;
    setDrag(null);
    if (d && d.to !== d.from) move(d.id, d.to);
  }
  function key(e: KeyboardEvent, id: string, index: number) {
    const by = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
    if (!by) return;
    e.preventDefault();
    move(id, Math.max(0, index + by));
  }

  const handle = (id: string, index: number) => ({
    onPointerDown: (e: PointerEvent) => down(e, id, index), onPointerMove: over, onPointerUp: up, onPointerCancel: () => { start.current = null; setDrag(null); },
    onKeyDown: (e: KeyboardEvent) => key(e, id, index),
  });

  /** The dragged row follows the finger; the rows it passes move by one row the other way. */
  function row(index: number): { className?: string; style?: CSSProperties } {
    if (!drag) return {};
    if (index === drag.from) return { className: 'dragging', style: { transform: `translateY(${drag.dy}px)` } };
    const shift = drag.from < drag.to && index > drag.from && index <= drag.to ? -drag.height
      : drag.to < drag.from && index >= drag.to && index < drag.from ? drag.height : 0;
    return shift ? { style: { transform: `translateY(${shift}px)` } } : {};
  }

  return { handle, row };
}
