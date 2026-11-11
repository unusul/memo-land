import { useState } from 'react';

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
      {!hideTitle && <input className="title-field" aria-label="Titolo" value={t} onChange={e => setT(e.target.value)} onBlur={leaveTitle}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />}
      <textarea className="body-field" aria-label="Testo" placeholder="Aggiungi un testo…" rows={Math.max(2, b.split('\n').length)}
        value={b} onChange={e => setB(e.target.value)} onBlur={() => { if (b !== body) void onSave({ body: b }); }} />
    </div>
  );
}
