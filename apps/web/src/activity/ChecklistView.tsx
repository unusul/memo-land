import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { addItem, assignItem, can, editItem, learnItem, setListAssignable, moveItem, removeItem, setListFixed, setListModel, sortBySection, splitQuantity, suggestItems, toggleItem, undoTo } from '@attivita/core';
import type { Activity, ChecklistItem } from '@attivita/core';
import { Disclosure } from '../shell/Disclosure.js';
import { SwipeRow } from '../shell/SwipeRow.js';
import type { SwipeAction } from '../shell/SwipeRow.js';
import { useToast } from '../shell/toast.js';
import { Icon } from '../shell/icons.js';
import { instantNow } from '../dates.js';
import { shortName } from '../labels.js';
import { MenuChoice, PopMenu } from '../shell/PopMenu.js';
import { iconOr } from '../groups/IconGrid.js';
import { useWs } from '../workspace/useWorkspace.js';
import { useReorder } from './useReorder.js';

/**
 * The list inside an activity: tick, add with Enter, remove. While typing, the texts this list has already seen are
 * proposed, most used first. Every change is saved at once through `change`.
 */
export function ChecklistView({ activity: a, me, editable, change, copy, members, modelChoice = false, typed: typedOut }: {
  activity: Activity; me: string; editable: boolean; change(next: () => Activity): Promise<unknown>;
  /** Where the text being typed is kept, for a page that saves the list itself when it closes (a new activity). */
  typed?: { current: string } | undefined;
  /** A list group's list can use a list model from Noi and be sorted by its sections (user's choice, 2026-11-16). */
  modelChoice?: boolean;
  /** Who an item can go to, the person first; absent where everything is the person's (personal group, draft). */
  members?: readonly string[] | undefined;
  /** Shown at the end of the header: a list group's page has no other row to hold Copia. */
  copy?: ReactNode;
}) {
  const [text, setText] = useState('');
  const items = a.checklist?.items ?? [];
  // The item whose menu of names is open: one at a time, opened by its icon or by the swipe.
  const [picking, setPicking] = useState<string | null>(null);
  // Only a shared list can be made assignable, and only once switched on: off, it behaves as before.
  const shared = members !== undefined && members.length > 1;
  const canAssign = editable && shared && a.checklist?.assignable === true;
  // A member is an account, shown by its short name; anyone else is the name typed for them.
  const nameOf = (who: string) => (who === me ? 'tu' : members?.includes(who) ? shortName(who) : who);
  // Names typed before in this list come back as choices, after the members.
  const typed = [...new Set(items.map(i => i.assignee).filter((w): w is string => w !== undefined && !members?.includes(w)))];
  const choices = [...(members ?? []), ...typed];
  const assign = (i: ChecklistItem, who: string | null) => void change(() => assignItem(a, i.id, who, me, instantNow()));
  /** A typed name that is already a choice («nessuno», «tu», a member, a name used before) is that choice, in any case. */
  const resolve = (typedName: string): string | null => {
    const t = typedName.trim().toLocaleLowerCase('it');
    if (t === '' || t === 'nessuno') return null;
    return choices.find(w => nameOf(w).toLocaleLowerCase('it') === t || w.toLocaleLowerCase('it') === t) ?? typedName.trim();
  };
  // Ticked items go under a row that opens and closes, as in a notes app: closed each time the list is shown.
  const toDo = items.filter(i => !i.done);
  const ticked = items.filter(i => i.done);
  // The list's model, when the person can see it: a model of a group they are not in stays named, but out of reach.
  const ws = useWs();
  const model = ws.models.find(m => m.id === a.checklist?.model);
  const suggestions = text.trim() ? suggestItems(a, text, 6, model?.model) : [];
  // An item the model does not know is learnt in its Altro, marked new (user's choice, 2026-11-18), by who can change
  // the model; for anyone else, or when the save fails, the model's page still shows it in Altro from the lists.
  // One save after the other, each on the newest model: items typed in a row left from the same version, and all but
  // the first were refused as a conflict.
  const modelNow = useRef(model);
  modelNow.current = model;
  const learning = useRef<Promise<Activity | undefined>>(Promise.resolve(undefined));
  const learn = (t: string) => {
    const group = model && ws.groups.find(g => g.id === model.groupId);
    const who = ws.engineOf(model?.groupId ?? '')?.account ?? me;
    if (!model || !group || group.archived || !can(group, who, 'editActivity')) return;
    learning.current = learning.current.then(saved => {
      const shown = modelNow.current;
      const base = saved && saved.id === shown?.id && saved.version >= shown.version ? saved : shown;
      if (!base) return saved;
      const next = learnItem(base, t, who, instantNow());
      return next === base ? base : ws.save(next).catch(() => base);
    });
  };

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

  // Swipes: towards the right ticks (or unticks); towards the left gives the item to someone, in a shared list, or takes
  // it away, with Annulla, where nobody else could take it (user's choice, 2026-11-16: the × removes in a shared list).
  const row = (i: ChecklistItem, index: number) => {
    const moving = editable && !i.done ? reorder.row(index) : {};
    return (
    <li key={i.id} className={[i.done ? 'done' : '', picking === i.id ? 'picking' : '', moving.className ?? ''].filter(Boolean).join(' ') || undefined} style={moving.style}>
      <SwipeRow {...(editable ? {
        right: { label: i.done ? 'Togli la spunta' : 'Spunta', icon: 'check', tone: 'done', run: () => tick(i) } as SwipeAction,
        left: (canAssign
          ? { label: 'Assegna', icon: 'me', tone: 'later', run: () => setPicking(i.id) }
          : { label: 'Togli', icon: 'trash', tone: 'remove', run: () => void remove(i) }) as SwipeAction,
      } : {})}>
        <div className="check-row">
          {editable && !i.done && (
            <button type="button" className="grip" aria-label={`Sposta ${i.text}`} title="Trascina per spostare" {...reorder.handle(i.id, index)}>
              <Icon name="grip" size={18} />
            </button>
          )}
          <input type="checkbox" checked={i.done} disabled={!editable} aria-label={i.text} onChange={() => tick(i)} />
          {editable ? <ItemText item={i} save={t => void edit(i, t)} /> : <span className="item-text"><ItemName text={i.text} /></span>}
          {canAssign && (
            <AssigneePicker item={i} choices={choices} nameOf={nameOf} resolve={resolve} onAssign={who => assign(i, who)}
              open={picking === i.id} setOpen={on => setPicking(on ? i.id : null)} />
          )}
          {editable && <button className="link" aria-label={`Togli ${i.text}`} title="Togli" onClick={() => void change(() => removeItem(a, i.id, me, instantNow()))}><Icon name="close" size={16} /></button>}
        </div>
      </SwipeRow>
    </li>
    );
  };

  const chooseModel = (id: string | null) => void change(() => setListModel(latest.current, id, me, instantNow()));
  // Already in order: nothing to save.
  const sortItems = () => {
    if (model?.model && sortBySection(a, model.model, me, instantNow()) !== a) void change(() => sortBySection(latest.current, model.model!, me, instantNow()));
  };

  // Text typed and left without Enter is added, not lost (user's bug, 2026-11-17): on leaving the field, and when the
  // page closes without moving the focus (the phone's back button). Toward the + or a suggestion, those add instead.
  const typing = useRef('');
  typing.current = text;
  if (typedOut) typedOut.current = text;
  function add(t: string) {
    typing.current = '';
    if (!t.trim()) return;
    setText('');
    void change(() => addItem(a, t, me, instantNow()));
    learn(t);
  }
  const addOnLeave = (to: EventTarget | null) => {
    if (!(to instanceof Element && to.closest('.new-item-row, .suggestions'))) add(text);
  };
  const learnLatest = useRef(learn);
  learnLatest.current = learn;
  useEffect(() => () => {
    if (!typing.current.trim()) return;
    void change(() => addItem(latest.current, typing.current, me, instantNow()));
    learnLatest.current(typing.current);
  }, []);

  return (
    <section className="checklist" aria-label="Lista">
      <div className="checklist-head">
        <p className="label">Lista{items.length > 0 && ` · ${items.filter(i => i.done).length}/${items.length}`}</p>
        {/* Beside Copia, as an icon that stays lit while on (user's choice, 2026-11-16): the line of text took a row. */}
        <span className="row-end">
          {editable && shared && (
            <button type="button" role="switch" className="icon-choice small" aria-label="Voci assegnabili" aria-checked={a.checklist?.assignable === true}
              title="Voci assegnabili: ogni voce può andare a una persona"
              onClick={() => void change(() => setListAssignable(a, a.checklist?.assignable !== true, me, instantNow()))}>
              <Icon name="me" size={18} />
            </button>
          )}
          {editable && modelChoice && (
            <PopMenu className="icon-choice small" label={<Icon name={iconOr(model?.model?.icon, 'documents')} size={18} />} buttonLabel="Modello della lista"
              menuLabel="Modello della lista" roomBelow={24 + 44 * (ws.models.length + 1)}>
              {close => <>
                <MenuChoice label="Nessun modello" value="" checked={!model} onChoose={() => { close(); if (a.checklist?.model) chooseModel(null); }} />
                {ws.models.map(m => (
                  <MenuChoice key={m.id} label={`${m.title} · ${ws.groups.find(g => g.id === m.groupId)?.name ?? ''}`} value={m.id} checked={m.id === model?.id}
                    onChoose={() => { close(); if (m.id !== model?.id) chooseModel(m.id); }} />
                ))}
              </>}
            </PopMenu>
          )}
          {/* Sorting is on request (user's choice, 2026-11-16): items added later go at the bottom until the next sort. Only
              who sees the model (a member of its group) can sort by it. */}
          {editable && modelChoice && model && (
            <button type="button" className="icon-choice small" aria-label="Ordina per sezione" title="Ordina per sezione" onClick={sortItems}>
              <Icon name="sort" size={18} />
            </button>
          )}
          {copy}
        </span>
      </div>
      <ul className="check-items" ref={openList}>{toDo.map(row)}</ul>
      {editable && (
        <>
          {/* A form, not an Enter keydown: phone keyboards send Enter as "Unidentified" while composing, but submit forms. */}
          <form className="new-item-row" onSubmit={e => { e.preventDefault(); add(text); }}>
            {/* The keyboard's return key adds the item and the field keeps the focus for the next one, as in a notes app.
                No capital first letter from the phone keyboard (user's choice, 2026-11-16): a list is written in lower case. */}
            <input className="new-item" aria-label="Nuova voce" placeholder="Aggiungi una voce…" enterKeyHint="enter" autoCapitalize="none" value={text} onChange={e => setText(e.target.value)} onBlur={e => addOnLeave(e.relatedTarget)} />
            {/* The + adds too; pressing it does not take the focus, so the phone keyboard stays open for the next item. */}
            <button type="submit" className="icon-choice" aria-label="Aggiungi la voce" title="Aggiungi la voce" disabled={!text.trim()} onPointerDown={e => e.preventDefault()}><Icon name="plus" /></button>
          </form>
          {suggestions.length > 0 && (
            <ul className="chips suggestions" aria-label="Suggerimenti">
              {suggestions.map(s => <li key={s}><button type="button" className="chip" onPointerDown={e => e.preventDefault()} onClick={() => add(s)}>{s}</button></li>)}
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

/**
 * Who has the item, inline in its row (user's choice, 2026-11-16): the name and the person icon open a small menu of
 * the app's own, under them, with «nessuno», the members, the names typed before in this list and «Altro nome…», which
 * turns into a field in the menu. The browser's own drop-down was tried first: it cannot follow the app's look.
 */
function AssigneePicker({ item, choices, nameOf, resolve, onAssign, open, setOpen }: {
  item: ChecklistItem; choices: readonly string[]; nameOf(who: string): string; resolve(typed: string): string | null;
  onAssign(who: string | null): void; open: boolean; setOpen(on: boolean): void;
}) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState('');
  const box = useRef<HTMLSpanElement>(null);
  const close = () => { setOpen(false); setTyping(false); setName(''); };
  const choose = (who: string | null) => { close(); if (who !== (item.assignee ?? null)) onAssign(who); };
  // A tap outside closes the menu, as Esc does.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close(); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  });
  const option = (who: string | null, label: string) => (
    <li key={who ?? ''} role="option" aria-selected={(item.assignee ?? null) === who} tabIndex={-1}
      onClick={() => choose(who)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(who); } }}>{label}</li>
  );
  return (
    <span className="who-pick" ref={box} onKeyDown={e => { if (e.key === 'Escape') close(); }}>
      <button type="button" className="who-btn" aria-label={`Assegna ${item.text}`} aria-haspopup="listbox" aria-expanded={open}
        title="Assegna" onClick={() => (open ? close() : setOpen(true))}>
        {item.assignee && <span className="who-name">{nameOf(item.assignee)}</span>}
        <Icon name="me" size={16} />
      </button>
      {open && (
        <div className="who-menu">
          <ul role="listbox" aria-label={`A chi va ${item.text}`}>
            {option(null, 'nessuno')}
            {choices.map(w => option(w, nameOf(w)))}
          </ul>
          {typing ? (
            <form onSubmit={e => { e.preventDefault(); choose(resolve(name)); }}>
              <input aria-label={`Altro nome per ${item.text}`} placeholder="Nome…" autoFocus value={name} onChange={e => setName(e.target.value)} />
            </form>
          ) : (
            <button type="button" className="who-other" onClick={() => setTyping(true)}>Altro nome…</button>
          )}
        </div>
      )}
    </span>
  );
}
