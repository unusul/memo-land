import { useEffect, useRef, useState } from 'react';

type Picker = 'camera' | 'gallery' | 'file';

/** As `.attach .menu` in styles.css: three 44px rows, the padding and the gap from the button. */
const MENU_WIDTH = 200;
const MENU_HEIGHT = 160;

const ITEMS: readonly { kind: Picker; label: string }[] = [
  { kind: 'camera', label: 'Scatta una foto' },
  { kind: 'gallery', label: "Scegli un'immagine" },
  { kind: 'file', label: 'Allega un file' },
];

/**
 * «+ Allega» opens a small menu, as in a notes app: the camera straight away, only images (Android then opens the
 * photo gallery instead of asking Camera, Video or Files), or any file. One hidden input per way in.
 */
export function AttachMenu({ onFiles, className = 'chip', disabled = false }: {
  onFiles(files: File[]): void; className?: string; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Near the right edge the menu opens leftwards, near the bottom upwards, so it never leaves the screen.
  const [place, setPlace] = useState({ end: false, up: false });
  const box = useRef<HTMLSpanElement>(null);
  const inputs = useRef<Partial<Record<Picker, HTMLInputElement | null>>>({});
  useCloseOutside(open, box, () => setOpen(false));

  function toggle() {
    const at = box.current?.getBoundingClientRect();
    setPlace({ end: (at?.left ?? 0) + MENU_WIDTH > window.innerWidth - 8, up: (at?.bottom ?? 0) + MENU_HEIGHT > window.innerHeight - 8 });
    setOpen(o => !o);
  }

  function choose(kind: Picker) {
    setOpen(false);
    inputs.current[kind]?.click();
  }

  return (
    <span className="attach" ref={box}>
      <button type="button" className={className} aria-haspopup="menu" aria-expanded={open} disabled={disabled} onClick={toggle}>+ Allega</button>
      {open && (
        <span role="menu" aria-label="Allega" className={['menu', place.end && 'end', place.up && 'up'].filter(Boolean).join(' ')} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } }}>
          {ITEMS.map((it, i) => <button key={it.kind} type="button" role="menuitem" autoFocus={i === 0} onClick={() => choose(it.kind)}>{it.label}</button>)}
        </span>
      )}
      <input ref={el => { inputs.current.camera = el; }} data-picker="camera" type="file" accept="image/*" capture="environment" hidden onChange={e => take(e, onFiles)} />
      <input ref={el => { inputs.current.gallery = el; }} data-picker="gallery" type="file" accept="image/*" multiple hidden onChange={e => take(e, onFiles)} />
      <input ref={el => { inputs.current.file = el; }} data-picker="file" type="file" multiple hidden onChange={e => take(e, onFiles)} />
    </span>
  );
}

function take(e: React.ChangeEvent<HTMLInputElement>, onFiles: (files: File[]) => void) {
  const files = Array.from(e.target.files ?? []);
  // Emptied so the same file can be picked again.
  e.target.value = '';
  if (files.length) onFiles(files);
}

/** A press outside the menu closes it, as a tap elsewhere does on the phone. */
function useCloseOutside(open: boolean, box: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, box, close]);
}
