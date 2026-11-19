import { useEffect, useRef, useState } from 'react';

type Picker = 'camera' | 'gallery' | 'file';
type Way = Picker | 'paste';

/** As `.attach .menu` in styles.css: four 44px rows, the padding and the gap from the button. */
const MENU_WIDTH = 200;
const MENU_HEIGHT = 204;

const ITEMS: readonly { kind: Way; label: string }[] = [
  { kind: 'camera', label: 'Scatta una foto' },
  { kind: 'gallery', label: "Scegli un'immagine" },
  { kind: 'paste', label: 'Incolla dagli appunti' },
  { kind: 'file', label: 'Allega un file' },
];

export const NO_IMAGE = "Negli appunti non c'è un'immagine.";
export const NO_CLIPBOARD = 'Non riesco a leggere gli appunti: il browser non lo consente o il permesso è stato negato.';

/**
 * The images on the device's clipboard, as files; `null` when the browser does not give them (no API, permission
 * denied, not over https). Chrome on Android asks the permission once; Safari on an iPhone shows its «Incolla» bubble.
 */
export async function readClipboardImages(): Promise<File[] | null> {
  try {
    const items = await navigator.clipboard.read();
    const blobs = await Promise.all(items.flatMap(it => it.types.filter(t => t.startsWith('image/')).slice(0, 1).map(t => it.getType(t))));
    return blobs.map(b => new File([b], `appunti.${b.type.slice('image/'.length) || 'png'}`, { type: b.type }));
  } catch {
    return null;
  }
}

/**
 * «+ Allega» opens a small menu, as in a notes app: the camera straight away, only images (Android then opens the
 * photo gallery instead of asking Camera, Video or Files), an image from the clipboard, or any file. One hidden input
 * per picker. «Incolla dagli appunti» (user's choice, 2026-11-19): on a phone the detail has no field to paste into,
 * so an image could be pasted only in a new draft; `onProblem` says when the clipboard has none or cannot be read.
 */
export function AttachMenu({ onFiles, onProblem, className = 'chip', disabled = false }: {
  onFiles(files: File[]): void; onProblem(text: string): void; className?: string; disabled?: boolean;
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

  function choose(kind: Way) {
    setOpen(false);
    if (kind === 'paste') void paste();
    else inputs.current[kind]?.click();
  }

  async function paste() {
    const files = await readClipboardImages();
    if (files === null) onProblem(NO_CLIPBOARD);
    else if (files.length === 0) onProblem(NO_IMAGE);
    else onFiles(files);
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
