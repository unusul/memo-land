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
export function PopMenu({ label, menuLabel, buttonLabel, title, className = 'chip', panel = false, roomBelow = ROOM_BELOW, children }: {
  label: ReactNode; menuLabel: string; className?: string; children(close: () => void): ReactNode;
  /** The hint shown on hover, for a button with only an icon. */
  title?: string;
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
      <button type="button" className={className} aria-label={buttonLabel} title={title} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{label}</button>
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
 * Width and shift of a panel opened under `anchor`, up to `max` px. It starts at the left edge of the page's column,
 * wherever its button is (user's choice, 2026-11-17): before, it opened under its button and moved with it, across the
 * page on a computer. Without a column, 16px inside the page's own area (not the window, whose width also counts the
 * scroll bar). The small menus of choices stay under their button.
 */
export function panelFit(anchor: Element, max = 360): { left: number; width: number } {
  const column = anchor.closest('.content > *');
  const area = column ?? anchor.closest('.content') ?? document.documentElement;
  const box = area.getBoundingClientRect();
  // From the margin the other elements keep, the left edge of the row holding the button (the chips, the buttons),
  // and as far from the right as from the left (user's choice, 2026-11-17: on the column's very edge it stuck out).
  const row = (anchor.closest('.chips, .btns') ?? anchor.parentElement)?.getBoundingClientRect();
  const from = row && row.left >= box.left ? row.left : box.left + (column ? 0 : 16);
  const inset = from - box.left;
  return { width: Math.min(max, box.width - 2 * inset), left: from - anchor.getBoundingClientRect().left };
}

/** One choice of a PopMenu: highlighted when it is the value set now. */
export function MenuChoice({ label, checked = false, value, icon, onChoose }: { label: string; checked?: boolean; value?: string; icon?: ReactNode; onChoose(): void }) {
  return <button type="button" role="menuitemradio" aria-checked={checked} data-value={value} className={icon ? 'with-icon' : undefined} onClick={onChoose}>{icon}{label}</button>;
}

/**
 * The app's own drop-down, in place of the browser's (user's choice, 2026-11-16: the browser's does not follow the
 * app's look): the value chosen and a ▾, opening its choices under it.
 */
export function MenuSelect<V extends string>({ label, value, options, onChange }: {
  label: string; value: V; options: readonly (readonly [V, string])[]; onChange(value: V): void;
}) {
  const text = options.find(([v]) => v === value)?.[1] ?? '';
  return (
    <PopMenu className="btn select" buttonLabel={label} label={`${text} ▾`} menuLabel={label} roomBelow={24 + 44 * options.length}>
      {close => options.map(([v, t]) => <MenuChoice key={v} label={t} value={v} checked={v === value} onChoose={() => { close(); onChange(v); }} />)}
    </PopMenu>
  );
}
