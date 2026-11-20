import { useLayoutEffect, useRef, useState } from 'react';
import type { TextareaHTMLAttributes } from 'react';

/**
 * Title and text edited in place, saved when the field is left, as in a notes app. An empty title is not saved:
 * the field goes back to the stored one.
 */
export function TextFields({ title, body, hideTitle = false, onSave }: { title: string; body: string; hideTitle?: boolean; onSave(text: { title?: string; body?: string }): Promise<unknown> }) {
  const [t, setT] = useState(title);
  const [b, setB] = useState(body);

  function leaveTitle() {
    if (t.trim() === '') return setT(title);
    if (t.trim() !== title) void onSave({ title: t });
  }

  return (
    <div className="text-fields">
      {!hideTitle && <TitleField value={t} onChange={e => setT(e.target.value)} onBlur={leaveTitle} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />}
      <BodyField value={b} onChange={e => setB(e.target.value)} onBlur={() => { if (b !== body) void onSave({ body: b }); }} />
    </div>
  );
}

/**
 * The title, on as many lines as it needs (user's bug, 2026-11-17: «Rinnovare l'assicurazione dell'auto» stopped at
 * «dell'a» on a phone, in a one-line field). Enter does not make a new line: it ends the title, as before.
 */
export function TitleField({ value, onKeyDown, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const box = useGrow(value);
  return <textarea ref={box} className="title-field" aria-label="Titolo" rows={1} value={value} {...rest}
    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); onKeyDown?.(e); }} />;
}

/**
 * The text, as tall as what it holds up to five lines, then it scrolls inside (user's choices, 2026-11-20: «scroll del
 * testo ko», then «metti lo scroll dopo 5 righe»): before, as many rows as its line breaks, so a long paragraph (a mail
 * pasted in) scrolled inside a two-line box.
 */
export const BODY_LINES = 5;
export function BodyField({ value, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const box = useGrow(value, BODY_LINES);
  return <textarea ref={box} className="body-field" aria-label="Testo" placeholder="Aggiungi un testo…" rows={2} value={value} {...rest} />;
}

/** A field that grows with its text; past `lines` lines, if given, it stops there and scrolls inside. */
function useGrow(value: string, lines?: number) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    const css = getComputedStyle(el);
    const line = parseFloat(css.lineHeight) || 1.4 * parseFloat(css.fontSize);
    const most = lines ? lines * line + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom) : Infinity;
    const tall = Math.min(el.scrollHeight, Math.ceil(most));
    // With its border: scrollHeight leaves it out, and the last line scrolled by a pixel or two.
    el.style.height = `${tall + el.offsetHeight - el.clientHeight}px`;
    el.style.overflowY = el.scrollHeight > Math.ceil(most) ? 'auto' : 'hidden';
  }, [value, lines]);
  return box;
}
