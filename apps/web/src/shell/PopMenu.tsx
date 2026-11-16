import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Room a menu needs below its button before it opens upwards, and beside it before it opens leftwards. */
const ROOM_BELOW = 320;
const ROOM_RIGHT = 220;
/** About the height of the tallest panel (Rimanda, Ripeti with its days). */
const PANEL_HEIGHT = 420;

/**
 * A button that opens a small menu right under it, over the page, as «+ Allega» does: what is chosen there applies at
 * once (user's choice, 2026-11-16, «la gestione in linea»). Near the screen's edges it opens leftwards or upwards. A
 * press outside or Esc closes it; `children` gets `close` for the choices that end it.
 */
export function PopMenu({ label, menuLabel, buttonLabel, className = 'chip', panel = false, roomBelow = ROOM_BELOW, children }: {
  label: ReactNode; menuLabel: string; className?: string; children(close: () => void): ReactNode;
  /** The button's name when its text alone does not say what it does (a value shown in a row). */
  buttonLabel?: string;
  /** Fields instead of a list of choices: the wider look of the property panels. */
  panel?: boolean;
  /** How tall the menu can get: below less than this it opens upwards. A two-choice menu needs far less than a month. */
  roomBelow?: number;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ end: false, up: false });
  // A panel is as wide as its fields allow, up to 360px, and shifted to stay 16px inside each side of the screen.
  const [fit, setFit] = useState<{ left: number; width: number } | null>(null);
  const box = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    // All of it in sight: a menu opened low on the page would end under the bottom bar.
    box.current?.querySelector('.menu')?.scrollIntoView?.({ block: 'nearest' });
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  function toggle() {
    const at = box.current?.getBoundingClientRect();
    // Upwards only when it fits there, below the page's own top (the header stays over it): otherwise downwards, and the
    // page scrolls to show it.
    const area = box.current?.closest('.content')?.getBoundingClientRect();
    const need = panel ? Math.max(roomBelow, PANEL_HEIGHT) : roomBelow;
    const below = (area?.bottom ?? window.innerHeight) - (at?.bottom ?? 0);
    const above = (at?.top ?? 0) - (area?.top ?? 0);
    setPlace({ end: !panel && (at?.left ?? 0) + ROOM_RIGHT > window.innerWidth - 8, up: below < need && above >= need });
    if (panel && box.current) setFit(panelFit(box.current));
    setOpen(o => !o);
  }

  return (
    <span className="attach" ref={box}>
      <button type="button" className={className} aria-label={buttonLabel} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{label}</button>
      {open && (
        <span role="menu" aria-label={menuLabel} className={['menu', panel && 'panel', place.end && 'end', place.up && 'up'].filter(Boolean).join(' ')}
          style={fit ?? undefined} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          {children(close)}
        </span>
      )}
    </span>
  );
}

/**
 * Width and shift of a panel opened under `anchor`: up to 360px, 16px inside each side of the page's own area (not
 * the window, whose width also counts the page's scroll bar, and a panel over it scrolls the page sideways).
 */
export function panelFit(anchor: Element): { left: number; width: number } {
  const area = anchor.closest('.content') ?? document.documentElement;
  const from = area.getBoundingClientRect().left;
  const to = from + area.clientWidth;
  const at = anchor.getBoundingClientRect().left;
  const width = Math.min(360, to - from - 32);
  return { width, left: Math.max(from + 16 - at, Math.min(0, to - 16 - width - at)) };
}

/** One choice of a PopMenu: highlighted when it is the value set now. */
export function MenuChoice({ label, checked = false, onChoose }: { label: string; checked?: boolean; onChoose(): void }) {
  return <button type="button" role="menuitemradio" aria-checked={checked} onClick={onChoose}>{label}</button>;
}
