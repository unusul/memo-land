import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icons.js';
import type { IconName } from './icons.js';

/** What a swipe does: shown under the row while it is dragged, run when the row is let go past the threshold. */
export interface SwipeAction { label: string; icon: IconName; tone: 'done' | 'later' | 'remove' | 'go'; run(): void }

/** Below this a drag is still a tap; it must also be mostly sideways, or the page scrolls instead. */
const START_PX = 8;
const MIN_RUN_PX = 72;

/**
 * A row that can be swiped: towards the right runs `right`, towards the left runs `left`. Past 40% of the row (at least
 * 72px) the action runs on release; before that the row goes back. The row's own buttons stay as they are: the swipe is
 * a shortcut. A tap that turned into a swipe does not also click.
 */
export function SwipeRow({ right, left, children }: { right?: SwipeAction | undefined; left?: SwipeAction | undefined; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  const dragging = useRef(false);
  const swallowClick = useRef(false);
  const threshold = () => Math.max(MIN_RUN_PX, (box.current?.offsetWidth ?? 0) * 0.4);
  const allowed = (d: number) => (d > 0 ? (right ? d : 0) : left ? d : 0);

  function down(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    dragging.current = false;
  }
  function move(e: React.PointerEvent) {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const mx = e.clientX - s.x, my = e.clientY - s.y;
    if (!dragging.current) {
      if (Math.abs(my) > START_PX && Math.abs(my) > Math.abs(mx)) { start.current = null; return; }
      if (Math.abs(mx) < START_PX || Math.abs(mx) < Math.abs(my) * 1.5) return;
      dragging.current = true;
      box.current?.setPointerCapture?.(e.pointerId);
    }
    setDx(allowed(mx));
  }
  function up(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    if (!s || !dragging.current) return;
    dragging.current = false;
    swallowClick.current = true;
    const d = allowed(e.clientX - s.x);
    setDx(0);
    if (Math.abs(d) >= threshold()) (d > 0 ? right : left)?.run();
  }
  function cancel() { start.current = null; dragging.current = false; setDx(0); }

  const shown = dx > 0 ? right : dx < 0 ? left : undefined;
  return (
    <div className={`swipe${shown ? ` swipe-${shown.tone}` : ''}`} ref={box}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}
      onClickCapture={e => { if (swallowClick.current) { swallowClick.current = false; e.preventDefault(); e.stopPropagation(); } }}>
      {shown && (
        <div className={`swipe-under ${dx > 0 ? 'from-left' : 'from-right'}`} aria-hidden="true">
          <Icon name={shown.icon} size={20} /><span>{shown.label}</span>
        </div>
      )}
      <div className="swipe-top" style={dx ? { transform: `translateX(${dx}px)` } : undefined}>{children}</div>
    </div>
  );
}
