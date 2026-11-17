import { useRef } from 'react';
import { setAgendaMode, useAgendaMode } from './agendaMode.js';
import type { AgendaMode } from './agendaMode.js';

/** Far enough sideways, and mostly sideways, to switch the view. */
const SWIPE_PX = 40;

/**
 * «Agenda | Calendario» at the bottom, over the sections' bar, where a right thumb reaches (user's choice, 2026-11-17):
 * a tap on either, or a swipe on the strip, to the left for the Calendar and to the right for the Agenda. First the two
 * words were at the top of the header, out of the thumb's reach.
 */
export function ViewStrip() {
  const mode = useAgendaMode();
  const start = useRef<{ x: number; y: number } | null>(null);
  const view = (m: AgendaMode, label: string) => (
    <button type="button" aria-current={mode === m ? 'page' : undefined} onClick={() => setAgendaMode(m)}>{label}</button>
  );
  return (
    <div className="view-strip" role="group" aria-label="Vista"
      onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={e => {
        const s = start.current;
        start.current = null;
        if (!s) return;
        const dx = e.clientX - s.x, dy = e.clientY - s.y;
        if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 2) return;
        setAgendaMode(dx < 0 ? 'month' : 'list');
      }}
      onPointerCancel={() => { start.current = null; }}>
      <span className="seg">{view('list', 'Agenda')}{view('month', 'Calendario')}</span>
    </div>
  );
}
