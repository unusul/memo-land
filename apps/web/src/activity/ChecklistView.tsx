import { useState } from 'react';
import { addItem, removeItem, setListFixed, suggestItems, toggleItem } from '@attivita/core';
import type { Activity } from '@attivita/core';
import { instantNow } from '../dates.js';
import { Icon } from '../shell/icons.js';

/**
 * The list inside an activity: tick, add with Enter, remove. While typing, the texts this list has already seen are
 * proposed, most used first. Every change is saved at once through `change`.
 */
export function ChecklistView({ activity: a, me, editable, change }: {
  activity: Activity; me: string; editable: boolean; change(next: () => Activity): Promise<unknown>;
}) {
  const [text, setText] = useState('');
  const items = a.checklist?.items ?? [];
  // Ticked items sink to the bottom, each group in the order it was added.
  const ordered = [...items.filter(i => !i.done), ...items.filter(i => i.done)];
  const suggestions = text.trim() ? suggestItems(a, text) : [];

  function add(t: string) {
    if (!t.trim()) return;
    setText('');
    void change(() => addItem(a, t, me, instantNow()));
  }

  return (
    <section className="checklist" aria-label="Lista">
      <p className="label">Lista{items.length > 0 && ` · ${items.filter(i => i.done).length}/${items.length}`}</p>
      <ul className="check-items">
        {ordered.map(i => (
          <li key={i.id} className={i.done ? 'done' : undefined}>
            <label>
              <input type="checkbox" checked={i.done} disabled={!editable} aria-label={i.text}
                onChange={() => void change(() => toggleItem(a, i.id, me, instantNow()))} />
              <span>{i.text}</span>
            </label>
            {editable && <button className="link" aria-label={`Togli ${i.text}`} onClick={() => void change(() => removeItem(a, i.id, me, instantNow()))}>×</button>}
          </li>
        ))}
      </ul>
      {editable && (
        <>
          {/* A form, not an Enter keydown: phone keyboards send Enter as "Unidentified" while composing, but submit forms. */}
          <form className="new-item-row" onSubmit={e => { e.preventDefault(); add(text); }}>
            <input className="new-item" aria-label="Nuova voce" placeholder="Aggiungi una voce…" enterKeyHint="done" value={text} onChange={e => setText(e.target.value)} />
            <button type="submit" className="icon-choice" aria-label="Aggiungi la voce" title="Aggiungi la voce" disabled={!text.trim()}><Icon name="plus" /></button>
          </form>
          {suggestions.length > 0 && (
            <ul className="chips suggestions" aria-label="Suggerimenti">
              {suggestions.map(s => <li key={s}><button type="button" className="chip" onClick={() => add(s)}>{s}</button></li>)}
            </ul>
          )}
          {a.props.repeat && (
            <label className="small muted fixed-switch">
              <input type="checkbox" aria-label="Lista fissa" checked={a.checklist?.fixed ?? false} onChange={e => void change(() => setListFixed(a, e.target.checked, me, instantNow()))} />
              Lista fissa: a ogni «Fatto» toglie solo le spunte (altrimenti toglie le voci spuntate)
            </label>
          )}
        </>
      )}
    </section>
  );
}
