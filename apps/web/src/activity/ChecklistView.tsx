import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { addItem, editItem, moveItem, removeItem, setListFixed, splitQuantity, suggestItems, toggleItem, undoTo } from '@attivita/core';
import type { Activity, ChecklistItem } from '@attivita/core';
import { Disclosure } from '../shell/Disclosure.js';
import { SwipeRow } from '../shell/SwipeRow.js';
import type { SwipeAction } from '../shell/SwipeRow.js';
import { useToast } from '../shell/toast.js';
import { Icon } from '../shell/icons.js';
import { instantNow } from '../dates.js';
import { useReorder } from './useReorder.js';

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
  const suggestions = text.trim() ? suggestItems(a, text) : [];

  // The activity as last shown: Annulla puts back what was before, on top of the version stored by then.
  const latest = useRef(a);
  latest.current = a;
  const toast = useToast();
  const tick = (i: ChecklistItem) => void change(() => toggleItem(a, i.id, me, instantNow()));
  const remove = async (i: ChecklistItem) => {
    const before = a;
    await change(() => removeItem(a, i.id, me, instantNow()));
    toast({ text: 'Voce tolta', undo: () => void change(() => undoTo(before, latest.current, instantNow())) });
  };
  // An emptied text takes the item away, as the swipe does, with Annulla.
  const edit = (i: ChecklistItem, t: string) =>
    t.trim() ? change(() => editItem(a, i.id, t, me, instantNow())) : remove(i);

  // The items to do are reordered by a handle on their left; the ticked ones stay in their row below.
  const openList = useRef<HTMLUListElement>(null);
  const reorder = useReorder(openList, (id, to) => void change(() => moveItem(latest.current, id, to, me, instantNow())));

  // Swipes: towards the right ticks (or unticks), towards the left takes the item away, with Annulla.
  const row = (i: ChecklistItem, index: number) => {
    const moving = editable && !i.done ? reorder.row(index) : {};
    return (
    <li key={i.id} className={[i.done ? 'done' : '', moving.className ?? ''].join(' ').trim() || undefined} style={moving.style}>
      <SwipeRow {...(editable ? {
        right: { label: i.done ? 'Togli la spunta' : 'Spunta', icon: 'check', tone: 'done', run: () => tick(i) } as SwipeAction,
        left: { label: 'Togli', icon: 'trash', tone: 'remove', run: () => void remove(i) } as SwipeAction,
      } : {})}>
        <div className="check-row">
          {editable && !i.done && (
            <button type="button" className="grip" aria-label={`Sposta ${i.text}`} title="Trascina per spostare" {...reorder.handle(i.id, index)}>
              <Icon name="grip" size={18} />
            </button>
          )}
          <input type="checkbox" checked={i.done} disabled={!editable} aria-label={i.text} onChange={() => tick(i)} />
          {editable ? <ItemText item={i} save={t => void edit(i, t)} /> : <span className="item-text"><ItemName text={i.text} /></span>}
          {editable && <button className="link" aria-label={`Togli ${i.text}`} onClick={() => void change(() => removeItem(a, i.id, me, instantNow()))}>×</button>}
        </div>
      </SwipeRow>
    </li>
    );
  };

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
      <ul className="check-items" ref={openList}>{toDo.map(row)}</ul>
      {editable && (
        <>
          {/* A form, not an Enter keydown: phone keyboards send Enter as "Unidentified" while composing, but submit forms. */}
          <form className="new-item-row" onSubmit={e => { e.preventDefault(); add(text); }}>
            {/* The keyboard's return key adds the item and the field keeps the focus for the next one, as in a notes app. */}
            <input className="new-item" aria-label="Nuova voce" placeholder="Aggiungi una voce…" enterKeyHint="enter" value={text} onChange={e => setText(e.target.value)} />
            {/* The + adds too; pressing it does not take the focus, so the phone keyboard stays open for the next item. */}
            <button type="submit" className="icon-choice" aria-label="Aggiungi la voce" title="Aggiungi la voce" disabled={!text.trim()} onPointerDown={e => e.preventDefault()}><Icon name="plus" /></button>
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
        <Disclosure label={ticked.length === 1 ? '1 voce spuntata' : `${ticked.length} voci spuntate`}>
          <ul className="check-items">{ticked.map(row)}</ul>
        </Disclosure>
      )}
    </section>
  );
}

/** The name, and the quantity as a small «×3» at the right when the text ends with one. */
function ItemName({ text }: { text: string }) {
  const { name, quantity } = splitQuantity(text);
  return <><span>{name}</span>{quantity !== null && <span className="qty">×{quantity}</span>}</>;
}

/**
 * An item's text: tapping it opens a field, as in a notes app. The return key or leaving the field saves, Escape
 * gives up; the tick stays on the box beside it.
 */
function ItemText({ item, save }: { item: ChecklistItem; save(text: string): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = (keep: boolean) => {
    if (draft === null) return;
    setDraft(null);
    if (keep && draft !== item.text) save(draft);
  };
  if (draft === null) {
    return (
      <button type="button" className="item-text" aria-label={`Modifica ${item.text}`} onClick={() => setDraft(item.text)}>
        <ItemName text={item.text} />
      </button>
    );
  }
  return (
    <form className="item-edit" onSubmit={e => { e.preventDefault(); done(true); }}>
      <input autoFocus aria-label={`Testo di ${item.text}`} enterKeyHint="done" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={() => done(true)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); done(false); } }} />
    </form>
  );
}
