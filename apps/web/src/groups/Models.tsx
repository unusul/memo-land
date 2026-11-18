import { useEffect, useRef, useState } from 'react';
import {
  addSection, archive, can, itemsIn, moveSection, newModel, placeItem, removeModelItem, removeSection, renameModel,
  renameSection, setModelIcon, undoTo, unplacedItems,
} from '@attivita/core';
import type { Activity, Group, ListModel, ModelSection } from '@attivita/core';
import { useReorder } from '../activity/useReorder.js';
import { instantNow, newId } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { MenuChoice, MenuSelect, PopMenu } from '../shell/PopMenu.js';
import { Icon } from '../shell/icons.js';
import { useToast } from '../shell/toast.js';
import { useWs } from '../workspace/useWorkspace.js';
import { IconGrid, iconOr } from './IconGrid.js';

/*
 * List models in Noi (user's choices, 2026-11-16): shared with the group each belongs to, usable by any list of a group
 * the person is in. A model is a hidden activity of its group (`isModel`); its page holds name, icon, sections in the
 * order of the walk through the shop, and the items placed in them. The lists show only their items.
 */

const modelGroupName = (groups: readonly Group[], m: Activity) => groups.find(g => g.id === m.groupId)?.name ?? '';

/** «Modelli» in Noi: one row per model, ⋯ opening its page, and «Nuovo modello». */
export function ModelRows({ groups, onOpen }: { groups: readonly Group[]; onOpen(id: string): void }) {
  const ws = useWs();
  const [creating, setCreating] = useState(false);
  const models = [...ws.models].sort((x, y) => x.title.localeCompare(y.title, 'it'));
  return (
    <section aria-labelledby="models-h" className="stack">
      <div className="noi-head">
        <p id="models-h" className="label">Modelli</p>
        {!creating && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Nuovo modello</button>}
      </div>
      {creating && <NewModel groups={groups} onDone={id => { setCreating(false); if (id) onOpen(id); }} />}
      {models.length > 0 && (
        <ul className="group-rows" aria-label="Modelli">
          {models.map(m => (
            <li key={m.id}>
              <div className="group-row">
                <button className="group-open" aria-label={`Apri il modello ${m.title}`} onClick={() => onOpen(m.id)}>
                  <span className="grp-icon" aria-hidden="true"><Icon name={iconOr(m.model?.icon, 'documents')} /></span>
                  <span className="group-names"><span className="t">{m.title}</span><span className="muted small">di {modelGroupName(ws.groups, m)}</span></span>
                </button>
                <button className="icon-choice small" aria-label={`Gestisci il modello ${m.title}`} title="Gestisci" onClick={() => onOpen(m.id)}><Icon name="more" size={18} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A new model: its name, the group it belongs to, and whether it starts empty or as the ready «Supermercato». */
function NewModel({ groups, onDone }: { groups: readonly Group[]; onDone(id?: string): void }) {
  const ws = useWs();
  const { account } = useSession();
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '');
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const id = `${groupId}#model:${newId()}`;
    const by = ws.engineOf(groupId)?.account ?? account;
    try { await ws.save(newModel({ id, groupId, accountId: by, name, ready }, instantNow())); onDone(id); } catch (err) { setProblem(errorText(err)); }
  }
  if (groups.length === 0) return <p className="muted small">Un modello appartiene a un gruppo: crea prima un gruppo.</p>;
  return (
    <form className="card stack new-group" onSubmit={e => void create(e)}>
      <label htmlFor="new-model" className="label">Nome del nuovo modello</label>
      <input id="new-model" aria-label="Nome del modello" required autoFocus value={name} onChange={e => setName(e.target.value)} />
      <div className="kv-row">
        <span className="muted">Gruppo</span>
        <MenuSelect label="Gruppo del modello" value={groupId} options={groups.map(g => [g.id, g.name] as const)} onChange={setGroupId} />
      </div>
      <div className="seg" role="radiogroup" aria-label="Si parte da">
        <button type="button" role="radio" aria-checked={!ready} onClick={() => setReady(false)}>Vuoto</button>
        <button type="button" role="radio" aria-checked={ready} onClick={() => { setReady(true); if (!name.trim()) setName('Supermercato'); }}>Supermercato (pronto)</button>
      </div>
      <div className="btns">
        <button className="btn primary" type="submit" disabled={!name.trim() || !groupId}>Crea</button>
        <button className="btn" type="button" onClick={() => onDone()}>Annulla</button>
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
    </form>
  );
}

/** What the lists using the model hold, unknown to it by name, that would go to `section`: new, not yet learnt. */
function newItemsIn(model: ListModel, lists: readonly Activity[], section: string) {
  return unplacedItems(model, lists).filter(u => u.section === section).map(u => ({ name: u.name, fresh: true }));
}

/**
 * A model's page, from Noi: name and icon, its group, then the sections by the handle with their items as chips, the
 * new ones (written in a list, not yet placed) lit in their section, a new item, a new section, and «Elimina il modello».
 * An item's chip opens the sections, its own highlighted, and «Togli dal modello». Only who edits the group changes it.
 */
export function ModelPage({ model: m, onBack }: { model: Activity; onBack(): void }) {
  const ws = useWs();
  const session = useSession();
  const toast = useToast();
  const group = ws.groups.find(g => g.id === m.groupId);
  const me = ws.engineOf(m.groupId ?? '')?.account ?? session.account;
  const editable = group !== undefined && !group.archived && can(group, me, 'editActivity');
  const latest = useRef(m);
  latest.current = m;
  // One save after the other, each on the newest model: items added in a row left from the same version, and all but
  // the first were refused as a conflict (seen 2026-11-18 adding two items from «+ voce»).
  const saving = useRef<Promise<Activity | undefined>>(Promise.resolve(undefined));
  const change = (next: () => Activity) => (saving.current = saving.current.then(saved => {
    if (saved && saved.version > latest.current.version) latest.current = saved;
    // A refused change (a section's name already there) leaves the queue going.
    let made: Activity;
    try { made = next(); } catch { return undefined; }
    return ws.save(made).catch(() => undefined);
  }));
  const [picking, setPicking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Sections closed each time the page opens (user's choice, 2026-11-16): a short page to reorder them. A section
  // holding new items opens by itself, so they are seen.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const lists = ws.activities.filter(a => a.checklist?.model === m.id);
    const anyNew = (id: string) => itemsIn(m.model!, id).some(it => it.fresh) || newItemsIn(m.model!, lists, id).length > 0;
    return new Set(m.model!.sections.filter(s => anyNew(s.id)).map(s => s.id));
  });
  const toggle = (id: string) => setOpen(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next; });
  const rows = useRef<HTMLUListElement>(null);
  const reorder = useReorder(rows, (id, to) => void change(() => moveSection(latest.current, id, to, me, instantNow())));
  const model = m.model!;
  const lists = ws.activities.filter(a => a.checklist?.model === m.id);
  // A section's items, the new ones first: learnt from the lists, or held by them and not known yet (user's choices,
  // 2026-11-18). Before, the unknown ones stood apart under «Senza sezione», Altro said 0, and a variant as «nutella
  // veg» was not new.
  const itemsOf = (section: string): Array<{ key?: string; name: string; fresh: boolean }> => [
    ...itemsIn(model, section), ...newItemsIn(model, lists, section),
  ].sort((x, y) => Number(y.fresh) - Number(x.fresh) || x.name.localeCompare(y.name, 'it', { sensitivity: 'base' }));
  // A new section goes before Altro and opens at once, with its «+ voce» (user's choice, 2026-11-18).
  const createSection = (name: string) => void change(() => {
    const next = addSection(latest.current, name, me, instantNow());
    const made = next.model!.sections.find(s => !latest.current.model!.sections.some(o => o.id === s.id));
    if (made) setOpen(prev => new Set(prev).add(made.id));
    return next;
  });
  const place = (item: string, section: string) => void change(() => placeItem(latest.current, item, section, me, instantNow()));

  async function removeWithUndo(s: ModelSection) {
    const before = latest.current;
    await change(() => removeSection(before, s.id, me, instantNow()));
    toast({ text: 'Sezione tolta', undo: () => void change(() => undoTo(before, latest.current, instantNow())) });
  }
  const chip = (name: string, current: string | undefined, key?: string, fresh = false) => (
    <li key={key ?? name}>
      {editable ? (
        <PopMenu className={fresh ? 'chip fresh' : 'chip'} label={name} buttonLabel={`Sezione di ${name}`} menuLabel={`Sezione di ${name}`} roomBelow={24 + 44 * (model.sections.length + 1)}>
          {close => <>
            {model.sections.map(s => (
              <MenuChoice key={s.id} label={s.name} value={s.id} checked={s.id === current} onChoose={() => { close(); if (s.id !== current || fresh) place(name, s.id); }} />
            ))}
            {key !== undefined && <MenuChoice label="Togli dal modello" value="" onChoose={() => { close(); void change(() => removeModelItem(latest.current, key, me, instantNow())); }} />}
          </>}
        </PopMenu>
      ) : <span className={fresh ? 'chip fresh' : 'chip'}>{name}</span>}
    </li>
  );

  return (
    <article aria-label={m.title} className="card stack manage model-page">
      <header className="manage-head">
        <button type="button" className="icon-choice small" aria-label="Indietro" title="Indietro" onClick={onBack}><Icon name="back" size={18} /></button>
        <button className="grp-icon pick" aria-label={`Icona di ${m.title}`} aria-expanded={picking} disabled={!editable} onClick={() => setPicking(v => !v)}>
          <Icon name={iconOr(model.icon, 'documents')} />
        </button>
        {editable
          ? <NameField label="Nome del modello" rename="Rinomina il modello" value={m.title} level save={n => void change(() => renameModel(latest.current, n, me, instantNow()))} />
          : <h2>{m.title}</h2>}
      </header>
      <p className="muted small manage-info">di {group?.name ?? ''} · lo vedono e lo cambiano i membri del gruppo</p>
      {picking && <IconGrid label={`Scegli l'icona di ${m.title}`} onChoose={icon => { setPicking(false); void change(() => setModelIcon(latest.current, icon, me, instantNow())); }} />}
      <p className="label">Sezioni</p>
      <ul className="check-items model-sections" ref={rows}>
        {model.sections.map((s, index) => {
          const moving = editable ? reorder.row(index) : {};
          const items = itemsOf(s.id);
          const fresh = items.filter(it => it.fresh).length;
          const shown = open.has(s.id);
          return (
            <li key={s.id} className={moving.className} style={moving.style}>
              <div role="group" aria-label={s.name}>
                <div className="check-row">
                  {editable && (
                    <button type="button" className="grip" aria-label={`Sposta ${s.name}`} title="Trascina per spostare" {...reorder.handle(s.id, index)}>
                      <Icon name="grip" size={18} />
                    </button>
                  )}
                  <button type="button" className="disclosure-row model-toggle" aria-label={`Voci di ${s.name}`} aria-expanded={shown} onClick={() => toggle(s.id)}>
                    <Icon name="chevron" size={18} />
                  </button>
                  {editable
                    ? <NameField label={`Nome di ${s.name}`} rename={`Rinomina ${s.name}`} value={s.name} save={n => void change(() => renameSection(latest.current, s.id, n, me, instantNow()))} />
                    : <span className="item-text">{s.name}</span>}
                  <span className="muted small model-count">{items.length}{fresh > 0 && ` · ${fresh === 1 ? '1 nuova' : `${fresh} nuove`}`}</span>
                  {editable && s.id !== 'altro' && (
                    <button type="button" className="link" aria-label={`Togli ${s.name}`} title="Togli" onClick={() => void removeWithUndo(s)}><Icon name="close" size={16} /></button>
                  )}
                </div>
                {shown && (
                  <ul className="model-items">
                    {items.map(it => chip(it.name, s.id, it.key, it.fresh))}
                    {editable && <SectionAdd section={s} onAdd={name => place(name, s.id)} />}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {editable && <SectionCreate onCreate={createSection} />}
      {editable && <>
        <div className="btns">
          {deleting ? <>
            <span className="small">Le liste che lo usano restano come sono, senza modello.</span>
            <button className="btn primary" onClick={() => void change(() => archive(latest.current, me, instantNow())).then(onBack)}>Conferma eliminazione</button>
            <button className="btn" onClick={() => setDeleting(false)}>Annulla</button>
          </> : <button className="btn" onClick={() => setDeleting(true)}><Icon name="trash" size={18} /> Elimina il modello</button>}
        </div>
      </>}
    </article>
  );
}

/**
 * The last chip of an open section, «+ voce»: a tap makes it a field that adds to this section and stays for the next
 * item; leaving it adds what is typed and closes it, Esc closes it without adding (user's choice, 2026-11-18). Before,
 * one field at the bottom of the page, with a menu of the section above it starting on the first one.
 */
function SectionAdd({ section, onAdd }: { section: ModelSection; onAdd(text: string): void }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <li>
        <button type="button" className="chip add-chip" aria-label={`Aggiungi una voce a ${section.name}`} onClick={() => setOpen(true)}>
          <Icon name="plus" size={14} /> voce
        </button>
      </li>
    );
  }
  return (
    <li className="model-add">
      <AddField label={`Nuova voce in ${section.name}`} placeholder={`Nuova voce in ${section.name}…`} button="Aggiungi la voce"
        icon="check" autoFocus onAdd={onAdd} onDone={() => setOpen(false)} />
    </li>
  );
}

/**
 * «+ sezione», a dashed row after the sections: a tap makes it the new section's name; ✓ or Enter creates it and closes,
 * Esc or leaving closes without creating, since a section made by mistake must be taken away by hand (user's choice,
 * 2026-11-18). Before, a field «Nuova sezione…» like the items' one, apart at the bottom.
 */
function SectionCreate({ onCreate }: { onCreate(name: string): void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const close = () => { setOpen(false); setName(''); };
  if (!open) {
    return (
      <button type="button" className="add-row" aria-label="Aggiungi una sezione" onClick={() => setOpen(true)}>
        <Icon name="plus" size={16} /> sezione
      </button>
    );
  }
  return (
    <form className="new-item-row" onSubmit={e => { e.preventDefault(); if (name.trim()) onCreate(name.trim()); close(); }}>
      <input className="new-item" aria-label="Nome della nuova sezione" placeholder="Nome della nuova sezione…" autoFocus value={name}
        onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        onBlur={e => { if (!(e.relatedTarget instanceof Element && e.relatedTarget.closest('.new-item-row'))) close(); }} />
      <button type="submit" className="icon-choice" aria-label="Crea la sezione" title="Crea la sezione" disabled={!name.trim()} onPointerDown={e => e.preventDefault()}><Icon name="check" /></button>
    </form>
  );
}

/**
 * A field with a + beside it, as the list's new item: the return key adds too, and the field stays for the next one.
 * With `onDone`, leaving the field or Esc closes it.
 */
function AddField({ label, placeholder, button, onAdd, icon = 'plus', autoFocus = false, onDone }: {
  label: string; placeholder: string; button: string; onAdd(text: string): void;
  icon?: 'plus' | 'check'; autoFocus?: boolean; onDone?(): void;
}) {
  const [text, setText] = useState('');
  // As the list's new item (user's bug, 2026-11-17): text left without Enter is added on leaving the field, unless
  // toward the + or the section menu beside it, and when the page closes without moving the focus.
  const pending = useRef({ text, onAdd });
  pending.current = { text, onAdd };
  const add = () => { pending.current.text = ''; if (!text.trim()) return; onAdd(text.trim()); setText(''); };
  useEffect(() => () => { const p = pending.current; if (p.text.trim()) p.onAdd(p.text.trim()); }, []);
  const addOnLeave = (to: EventTarget | null) => { if (!(to instanceof Element && to.closest('.new-item-row'))) { add(); onDone?.(); } };
  const cancel = (e: { key: string; stopPropagation(): void }) => {
    if (e.key !== 'Escape' || !onDone) return;
    e.stopPropagation();
    pending.current.text = '';
    onDone();
  };
  return (
    <form className="new-item-row" onSubmit={e => { e.preventDefault(); add(); }}>
      <input className="new-item" aria-label={label} placeholder={placeholder} enterKeyHint="enter" autoCapitalize="none" autoFocus={autoFocus} value={text}
        onChange={e => setText(e.target.value)} onBlur={e => addOnLeave(e.relatedTarget)} onKeyDown={cancel} />
      <button type="submit" className="icon-choice" aria-label={button} title={button} disabled={!text.trim()} onPointerDown={e => e.preventDefault()}><Icon name={icon} /></button>
    </form>
  );
}

/** A name: tapping it opens a field; the return key or leaving it saves, Escape gives up. */
function NameField({ label, rename, value, save, level = false }: { label: string; rename: string; value: string; save(name: string): void; level?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const done = (keep: boolean) => {
    if (draft === null) return;
    setDraft(null);
    if (keep && draft.trim() && draft.trim() !== value) save(draft);
  };
  if (draft === null) {
    const text = <button type="button" className="item-text" aria-label={rename} onClick={() => setDraft(value)}>{value}</button>;
    return level ? <h2 className="model-name">{text}</h2> : text;
  }
  return (
    <form className="item-edit" onSubmit={e => { e.preventDefault(); done(true); }}>
      <input autoFocus aria-label={label} enterKeyHint="done" value={draft}
        onChange={e => setDraft(e.target.value)} onBlur={() => done(true)}
        onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); } }} />
    </form>
  );
}
