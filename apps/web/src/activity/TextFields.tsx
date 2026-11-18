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
      <textarea className="body-field" aria-label="Testo" placeholder="Aggiungi un testo…" rows={Math.max(2, b.split('\n').length)}
        value={b} onChange={e => setB(e.target.value)} onBlur={() => { if (b !== body) void onSave({ body: b }); }} />
    </div>
  );
}

/**
 * The title, on as many lines as it needs (user's bug, 2026-11-17: «Rinnovare l'assicurazione dell'auto» stopped at
 * «dell'a» on a phone, in a one-line field). Enter does not make a new line: it ends the title, as before.
 */
export function TitleField({ value, onKeyDown, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }) {
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    // With its border: scrollHeight leaves it out, and the last line scrolled by a pixel or two.
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [value]);
  return <textarea ref={box} className="title-field" aria-label="Titolo" rows={1} value={value} {...rest}
    onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); onKeyDown?.(e); }} />;
}
