import { useState } from 'react';
import type { ReactNode } from 'react';
import { addItem, removeItem, setListFixed, suggestItems, toggleItem } from '@attivita/core';
import type { Activity, ChecklistItem } from '@attivita/core';
import { Icon } from '../shell/icons.js';
import { instantNow } from '../dates.js';

/**
 * The list inside an activity: tick, add with Enter, remove. While typing, the texts this list has already seen are
 * proposed, most used first. Every change is saved at once through `change`.
 */
export function ChecklistView({ activity: a, me, editable, change, copy }: {
  activity: Activity; me: string; editable: boolean; change(next: () => Activity): Promise<unknown>;
  /** Shown at the end of the header: a list group's page has no other row to hold Copia. */
  copy?: ReactNode;
}) {
  const [text, setText] = useState('');
  const items = a.checklist?.items ?? [];
  // Ticked items go under a row that opens and closes, as in a notes app: closed each time the list is shown.
  const toDo = items.filter(i => !i.done);
  const ticked = items.filter(i => i.done);
  const [showTicked, setShowTicked] = useState(false);
  const suggestions = text.trim() ? suggestItems(a, text) : [];

  const row = (i: ChecklistItem) => (
    <li key={i.id} className={i.done ? 'done' : undefined}>
      <label>
        <input type="checkbox" checked={i.done} disabled={!editable} aria-label={i.text}
          onChange={() => void change(() => toggleItem(a, i.id, me, instantNow()))} />
        <span>{i.text}</span>
      </label>
      {editable && <button className="link" aria-label={`Togli ${i.text}`} onClick={() => void change(() => removeItem(a, i.id, me, instantNow()))}>×</button>}
    </li>
  );

  function add(t: string) {
    if (!t.trim()) return;
    setText('');
    void change(() => addItem(a, t, me, instantNow()));
  }

  return (
    <section className="checklist" aria-label="Lista">
      <div className="checklist-head">
        <p className="label">Lista{items.length > 0 && ` · ${items.filter(i => i.done).length}/${items.length}`}</p>
        {copy}
      </div>
      <ul className="check-items">{toDo.map(row)}</ul>
      {editable && (
        <>
          {/* A form, not an Enter keydown: phone keyboards send Enter as "Unidentified" while composing, but submit forms. */}
          <form className="new-item-row" onSubmit={e => { e.preventDefault(); add(text); }}>
            {/* The keyboard's return key adds the item and the field keeps the focus for the next one, as in a notes app. */}
            <input className="new-item" aria-label="Nuova voce" placeholder="Aggiungi una voce…" enterKeyHint="enter" value={text} onChange={e => setText(e.target.value)} />
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
      {ticked.length > 0 && (
        <div className="ticked">
          <button type="button" className="ticked-row" aria-expanded={showTicked} aria-controls={`ticked-${a.id}`} onClick={() => setShowTicked(v => !v)}>
            <Icon name="chevron" size={18} />
            {ticked.length === 1 ? '1 voce spuntata' : `${ticked.length} voci spuntate`}
          </button>
          {showTicked && <ul id={`ticked-${a.id}`} className="check-items">{ticked.map(row)}</ul>}
        </div>
      )}
    </section>
  );
}
