import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/** Room a menu needs below its button before it opens upwards, and beside it before it opens leftwards. */
const ROOM_BELOW = 320;
const ROOM_RIGHT = 220;

/**
 * A button that opens a small menu right under it, over the page, as «+ Allega» does: what is chosen there applies at
 * once (user's choice, 2026-11-16, «la gestione in linea»). Near the screen's edges it opens leftwards or upwards. A
 * press outside or Esc closes it; `children` gets `close` for the choices that end it.
 */
export function PopMenu({ label, menuLabel, buttonLabel, className = 'chip', children }: {
  label: ReactNode; menuLabel: string; className?: string; children(close: () => void): ReactNode;
  /** The button's name when its text alone does not say what it does (a value shown in a row). */
  buttonLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState({ end: false, up: false });
  const box = useRef<HTMLSpanElement>(null);
  const close = () => setOpen(false);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  function toggle() {
    const at = box.current?.getBoundingClientRect();
    setPlace({ end: (at?.left ?? 0) + ROOM_RIGHT > window.innerWidth - 8, up: (at?.bottom ?? 0) + ROOM_BELOW > window.innerHeight - 8 && (at?.top ?? 0) > ROOM_BELOW });
    setOpen(o => !o);
  }

  return (
    <span className="attach" ref={box}>
      <button type="button" className={className} aria-label={buttonLabel} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{label}</button>
      {open && (
        <span role="menu" aria-label={menuLabel} className={['menu', place.end && 'end', place.up && 'up'].filter(Boolean).join(' ')}
          onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          {children(close)}
        </span>
      )}
    </span>
  );
}

/** One choice of a PopMenu: highlighted when it is the value set now. */
export function MenuChoice({ label, checked = false, onChoose }: { label: string; checked?: boolean; onChoose(): void }) {
  return <button type="button" role="menuitemradio" aria-checked={checked} onClick={onChoose}>{label}</button>;
}
