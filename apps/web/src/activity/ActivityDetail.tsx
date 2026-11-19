import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { readBytes } from '../capture/CaptureSheet.js';
import { shrinkImage } from '../capture/images.js';
import { AttachMenu } from '../capture/AttachMenu.js';
import { enqueueDraft, linkAttachments } from '../offline/outbox.js';
import type { QueuedFile } from '../offline/outbox.js';
import {
  accept, addItem, anchorOf, removeAttachment, archive, assign, assignToName, backToDraft, can, claim, complete, moveBetweenGroups, moveToGroup, resumeIfDue, setProp, editText, markConditionMet, nextDue, occurrencesBetween, rankProps,
  moveOccurrence, leaveOccurrence, reject, release, removeProp, reopen, reopenOccurrence, restoreOccurrence, roleIn, rebase, setClosesItself, setInfo, setOffCalendar, shapeOf, skipOccurrence, snooze, takeOccurrence,
} from '@attivita/core';
import type { Activity, PropKey } from '@attivita/core';
import { instantNow, localNow } from '../dates.js';
import { PRIORITY_LABEL, PROP_LABEL, ROLE_LABEL, SHAPE_LABEL, errorText, historyText, shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { loadUsage, noteUse } from '../usage/usageStore.js';
import { useWs } from '../workspace/useWorkspace.js';
import { availableActions } from './actions.js';
import { movedNote, occurrenceAt } from './occurrence.js';
import { MoveOccurrenceForm } from './MoveOccurrenceForm.js';
import { shortDay } from './DatePicker.js';
import { isHighlighted, rowSizeOf, setRowSize, toggleHighlight, useBarPrefs } from '../groups/barPrefs.js';
import { AlertButton, AlertRow } from './AlertButton.js';
import type { RowSize } from '../groups/barPrefs.js';
import { Attachments } from './Attachments.js';
import { Links } from './Links.js';
import { ChecklistView } from './ChecklistView.js';
import { CopyButton, useCopyText } from './CopyButton.js';
import { Disclosure } from '../shell/Disclosure.js';
import { useBackLayer } from '../shell/back.js';
import { PanelActions, PanelBackdrop, PanelHead, useEscape } from '../shell/PanelActions.js';
import { Icon } from '../shell/icons.js';
import type { IconName } from '../shell/icons.js';
import { MenuChoice, PopMenu } from '../shell/PopMenu.js';
import { DatePicker } from './DatePicker.js';
import { SnoozeForm } from './SnoozeForm.js';
import { describeRepeat, isWeekly } from './timing.js';
import type { ActionKind } from './actions.js';
import { DecomposeForm } from './DecomposeForm.js';
import { TextFields, TitleField } from './TextFields.js';
import { PropertyForm } from './PropertyForms.js';
import { moveTargets } from '../groups/moveTargets.js';
import { groupName } from '../groups/GroupsView.js';
import type { Chip } from './PropertyForms.js';

/** The chips that open a menu under themselves instead of a form (user's choice, 2026-11-16). */
type InlineKey = 'priority' | 'assignment' | 'due';
const INLINE: ReadonlySet<Chip> = new Set<Chip>(['priority', 'assignment', 'due']);
/** The properties with more fields at once: a panel over the page (user's choices, 2026-11-16 and 2026-11-18). */
const PANEL: ReadonlySet<Chip> = new Set<Chip>(['schedule', 'repeat', 'waitingFor']);
const CHIP_PROPS: readonly PropKey[] = ['due', 'schedule', 'repeat', 'assignment', 'waitingFor', 'priority'];
const ACTION_LABEL: Record<ActionKind, string> = {
  accept: 'Accetta', reject: 'Rifiuta…', release: 'Lascia…', claim: 'Me la prendo', cover: 'Copro io questa', leaveOccurrence: 'Lascia questa volta', complete: 'Fatto', reopenOccurrence: 'Togli fatta',
  skip: 'Salta questa volta', moveOccurrence: 'Sposta questa volta…', restore: 'Rimetti',
  met: 'Segna avverata', moveToGroup: 'Sposta in un gruppo', decompose: 'Scomponi…',
  snooze: 'Rimanda…', archive: 'Archivia', toDraft: 'Torna bozza',
};
/** Highlighted only where someone waits for the person's answer: a proposal to accept. */
const PRIMARY: ReadonlySet<ActionKind> = new Set<ActionKind>(['accept']);
/** What Chiudi says after saving a form left open. */
const SAVED: Record<Chip, string> = {
  due: 'Scadenza salvata', schedule: 'Data e ora salvata', repeat: 'Ripeti salvato', assignment: 'Assegnazione salvata',
  waitingFor: 'Attesa salvata', resumeAt: 'Rimando salvato', parentId: 'Attività madre salvata', groupId: 'Gruppo salvato',
  priority: 'Priorità salvata',
};

/**
 * `onClose(message)` tells the shell what Chiudi saved, if anything. With `fresh` the detail is a new activity of a group,
 * kept here until it has a title and is saved (Salva, or Chiudi): the properties are set on it meanwhile, nothing is stored.
 * With `asGroupList` it is a list group's own activity, shown as the group's page: no Chiudi and no title (the group's
 * name is above), the list always open, and nothing that would take it out of the group.
 */
export function ActivityDetail({ activityId, occurrenceKey, fresh, asGroupList = false, initialForm, onClose }: {
  activityId: string; occurrenceKey?: string | undefined; fresh?: Activity; asGroupList?: boolean;
  /** Opens with a form ready: the date, after the swipe «Sposta la data» in the agenda. */
  initialForm?: 'due' | 'schedule' | undefined;
  onClose(message?: string): void;
}) {
  const { account: me, personalGroupId, outbox, primary } = useSession();
  const ws = useWs();
  const [local, setLocal] = useState<Activity | null>(fresh ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Chip | 'reject' | 'release' | 'decompose' | 'snooze' | 'moveOccurrence' | null>(initialForm ?? null);
  const [reason, setReason] = useState('');
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [usage, setUsage] = useState(() => loadUsage(me));
  const [problem, setProblem] = useState<string | null>(null);
  // The open property form's change, if any: Chiudi saves it instead of dropping it.
  const pending = useRef<(() => Activity) | null>(null);
  // The list's item being typed in a new activity: Salva, Indietro and the phone's back add it (user's bug, 2026-11-17:
  // it was lost, added only after the new activity had already been created from what it held).
  const typedItem = useRef('');
  const [listOpen, setListOpen] = useState(false);
  // The phone's back closes the activity as Chiudi does (a list group's page is the group's, not a layer of its own).
  const closeOnBack = useRef<() => void>(() => onClose());
  useBackLayer(!asGroupList, () => closeOnBack.current());
  // An open panel is a layer of its own: the phone's back cancels it, as Annulla (user's choice, 2026-11-17).
  useBackLayer(form !== null && PANEL.has(form as Chip), () => setForm(null));
  useEscape(form !== null && PANEL.has(form as Chip), () => setForm(null));
  // A panel (Data e ora, Ripeti, In attesa di) opens over the page under what was tapped, the page dimmed behind it; it
  // closes with Applica or Annulla, Esc or the phone's back cancel it, a press outside does nothing (user's choices,
  // 2026-11-17; before, a press outside saved and closed it).
  const panelBox = useRef<HTMLSpanElement | null>(null);
  const savePanel = useRef<() => void>(() => undefined);
  // The detail's saves, one after the other, and the last one it made itself (see run).
  const saveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const ownSave = useRef<Activity | null>(null);
  useEffect(() => {
    if (!form || !PANEL.has(form as Chip)) return;
    // All of it in sight: a panel opened low on the page would end under the bottom bar.
    panelBox.current?.querySelector('.panel')?.scrollIntoView?.({ block: 'nearest' });
  }, [form]);

  const a = local ?? [...ws.activities, ...ws.drafts].find(x => x.id === activityId);
  const isNew = local !== null;
  if (!a) return ws.loaded ? <p className="muted">Questa attività non c'è più o non è visibile per te.</p> : <p className="muted">Carico…</p>;
  const group = a.groupId ? ws.groups.find(g => g.id === a.groupId) ?? null : null;
  const role = group ? roleIn(group, me) ?? 'guest' : 'owner';
  const occ = occurrenceAt(a, occurrenceKey);
  // As the Agenda sees it: a snooze whose time has come is over, though not saved yet (user's bug: the detail said
  // «rimandata» after the time, while the Agenda showed it again).
  const shape = shapeOf(a.props.resumeAt !== undefined ? resumeIfDue(a, localNow(), instantNow()) : a, personalGroupId);
  const actions = (a.status === 'open' && !group?.archived ? availableActions(a, occ, group, me) : []).filter(k => !asGroupList || (k !== 'archive' && k !== 'toDraft'));
  // A done or archived activity is read only: it is reopened from the list it sits in.
  const closed = a.status !== 'open';
  // An archived group is read only too, until its owner reopens it.
  const canEdit = !closed && !group?.archived && (a.groupId === null || (group !== null && role !== 'guest'));

  // On a list group the button says what completing does: the list ends, or starts again when it repeats.
  // A moved occurrence goes back to its own day, which the button names.
  const labelOf = (k: ActionKind) => {
    if (asGroupList && k === 'complete') return a.props.repeat ? 'Completa e ricomincia' : 'Completa la lista';
    if (k === 'restore' && occ && !occ.skipped) return `Rimetti al ${shortDay(occ.key.slice(0, 10))}`;
    return ACTION_LABEL[k];
  };

  /**
   * One save after the other, and a change computed on the version this page showed put again on the one it has just
   * saved itself (user's bug, 2026-11-17): the text saved on leaving the field and Archivia tapped at once left from the
   * same version; the second was refused as «Qualcun altro l'ha appena modificata» and lost. A change made by someone
   * else meanwhile is still a conflict: only this page's own last save is a base to rebase on.
   */
  async function run(change: () => Activity, after?: () => void): Promise<boolean> {
    try {
      setProblem(null);
      const base = a!;
      const next = change();
      if (isNew) setLocal(next);
      else if (next !== base) {
        const job = saveQueue.current.then(async () => {
          const last = ownSave.current;
          // Only a change computed on an older version than the one just saved, and on the version this page showed
          // (Annulla, for one, computes on the newest already: put again on it, it was undone).
          const fresh = last && last.id === base.id && last.groupId === base.groupId && next.version === base.version && last.version > next.version;
          ownSave.current = await ws.save(fresh ? rebase(base, next, last) : next);
        });
        saveQueue.current = job.catch(() => undefined);
        await job;
      }
      after?.();
      return true;
    } catch (e) {
      setProblem(errorText(e));
      return false;
    }
  }

  async function close() {
    if (isNew) {
      const it = pending.current ? pending.current() : a!;
      return create(typedItem.current.trim() ? addItem(it, typedItem.current, me, instantNow()) : it);
    }
    const next = pending.current;
    if (!next || !form || form === 'reject' || form === 'release' || form === 'decompose' || form === 'snooze' || form === 'moveOccurrence') return onClose(undefined);
    if (await run(next)) onClose(SAVED[form]);
  }

  closeOnBack.current = () => void close();
  savePanel.current = () => {
    const next = pending.current;
    if (next) void run(next, () => setForm(null));
    else setForm(null);
  };
  /**
   * Opens a panel: a sheet from the bottom on a phone, a window in the middle on a wide screen (user's choice,
   * 2026-11-18). Before, under what was tapped, placed and sized by hand.
   */
  function openPanel(k: Chip) {
    if (form === k) return savePanel.current();
    setForm(k);
  }
  const panelOf = (k: Chip) => form === k && (<>
    <PanelBackdrop />
    <div className="menu panel" role="dialog" aria-label={k === 'groupId' ? 'Gruppo' : PROP_LABEL[k]}>
      <PanelHead title={k === 'groupId' ? 'Gruppo' : PROP_LABEL[k]} onCancel={() => setForm(null)} />{propForm}</div>
  </>);

  /** The activity first, then its files, then the activity again with them. Offline it becomes a draft, with its files. */
  async function create(it: Activity) {
    const title = it.title.trim();
    if (!title) return onClose();
    setSaving(true);
    try {
      const queued: QueuedFile[] = await Promise.all(files.map(async f => ({ name: f.name, mimeType: f.type || 'application/octet-stream', bytes: await readBytes(f) })));
      const there = ws.engineOf(it.groupId!);
      if (!navigator.onLine || !there) {
        await enqueueDraft(outbox, me, { ...it, title, groupId: null, accountId: me }, queued, instantNow());
        return onClose(`Senza rete: salvata nelle bozze. Spostala in ${group?.name ?? 'quel gruppo'} quando torna la connessione.`);
      }
      const saved = await there.saveActivity({ ...it, title }, null);
      if (queued.length) {
        const refs = await Promise.all(queued.map(f => there.putAttachment(saved.id, f)));
        await there.saveActivity({ ...saved, attachments: refs }, saved.version);
      }
      await ws.reload();
      onClose();
    } catch (e) {
      setProblem(errorText(e));
      setSaving(false);
    }
  }

  /** A new activity keeps its files until Salva; an existing one gets them straight away. */
  async function addFiles(incoming: File[]) {
    const fit = await fitFiles(incoming);
    if (isNew) setFiles(l => [...l, ...fit]);
    else if (fit.length) await attachNow(fit);
  }

  async function fitFiles(incoming: File[]): Promise<File[]> {
    const limits = holder()?.limits;
    const fit: File[] = [];
    for (const f of incoming) {
      // A file the browser cannot shrink keeps its size, and the limit below still applies.
      const small = limits ? await shrinkImage(f, limits).catch(() => f) : f;
      if (limits && small.size > limits.maxAttachmentBytes) setProblem(`L'allegato ${f.name} è troppo grande anche dopo la riduzione: non l'ho aggiunto.`);
      else fit.push(small);
    }
    return fit;
  }

  /** The engine holding the activity: a draft's is the account's own. */
  function holder() {
    return a!.groupId === null ? primary : ws.engineOf(a!.groupId);
  }

  /** The files first, then the activity read again and saved with them after those it has. */
  async function attachNow(fit: File[]) {
    const engine = holder();
    if (!engine) return;
    setSaving(true);
    try {
      setProblem(null);
      const refs = [];
      for (const f of fit) refs.push(await engine.putAttachment(a!.id, { name: f.name, mimeType: f.type || 'application/octet-stream', bytes: await readBytes(f) }));
      await linkAttachments(engine, a!, refs);
      await ws.reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setSaving(false);
    }
  }

  function act(kind: ActionKind) {
    const now = instantNow();
    const it: Activity = a!;
    switch (kind) {
      case 'accept': return run(() => accept(it, me, now));
      case 'reject': return setForm('reject');
      case 'release': return setForm('release');
      case 'claim': return run(() => claim(it, me, role, now));
      case 'cover': return run(() => takeOccurrence(it, occ!.key, me, role, now));
      case 'leaveOccurrence': return run(() => leaveOccurrence(it, occ!.key, me, now));
      case 'complete': return run(() => complete(it, me, occ?.key ?? localNow(), now, occ?.key));
      case 'reopenOccurrence': return run(() => reopenOccurrence(it, occ!.key, me, now));
      case 'skip': return run(() => skipOccurrence(it, occ!.key, me, role, now));
      case 'moveOccurrence': return setForm(form === 'moveOccurrence' ? null : 'moveOccurrence');
      case 'restore': return run(() => restoreOccurrence(it, occ!.key, me, role, now));
      case 'met': return run(() => markConditionMet(it, me, role, now));
      case 'moveToGroup': return setForm('groupId');
      case 'decompose': return setForm('decompose');
      case 'snooze': return setForm('snooze');
      case 'archive': return run(() => archive(it, me, now), () => onClose());
      case 'toDraft': return run(() => backToDraft(it, me, now), () => onClose('Rimessa fra le bozze'));
    }
  }

  // Who a list item can go to: the person first, then the others; none in the personal group or on a draft.
  const listMembers = group && group.kind !== 'personal' ? [me, ...Object.keys(group.members).filter(m => m !== me)] : undefined;
  /** Sets a property chosen in a chip's menu, as a form's Aggiungi did, and counts the use for the chips' order. */
  const applyInline = (k: InlineKey, next: () => Activity) => run(next, () => setUsage(noteUse(me, k)));
  // A chip whose value is one choice among a few opens a menu under itself; the others keep their form below the chips.
  // A function, not a component: a component declared here would be a new one at each render, and lose its open menu.
  /**
   * Where it can go, as a menu: from the «+ Gruppo» chip of a draft, the Dove row and «Sposta in un gruppo» (2026-11-16).
   */
  function groupChoices(close: () => void) {
    const it = a!;
    const targets = moveTargets(ws.groups, me, it.groupId);
    if (targets.length === 0) return <span className="menu-note">Nessun altro gruppo.</span>;
    return targets.map(g => (
      <MenuChoice key={g.id} label={groupName(g)} onChoose={() => {
        close();
        void run(() => (it.groupId === null ? moveToGroup(it, g.id, me, instantNow()) : moveBetweenGroups(it, g.id, me, instantNow())));
      }} />
    ));
  }
  function inlineChip(k: InlineKey) {
    return <PopMenu key={k} label={`+ ${PROP_LABEL[k]}`} menuLabel={PROP_LABEL[k]}>{inlineChoices(k)}</PopMenu>;
  }
  /**
   * The choices of a chip's menu, the same for the row of a property already set, where the value now is marked; there
   * Priorità also offers «Normale», which takes it away.
   */
  function inlineChoices(k: InlineKey) {
    const it = a!;
    return (close: () => void) => {
      const set = (next: () => Activity) => { close(); void applyInline(k, next); };
      if (k === 'priority') {
        const now = it.props.priority;
        return <>
          <MenuChoice label="Alta" checked={now === 'high'} onChoose={() => set(() => setProp(it, 'priority', 'high', me, instantNow()))} />
          {now !== undefined && <MenuChoice label="Normale" onChoose={() => set(() => removeProp(it, 'priority', me, instantNow()))} />}
          <MenuChoice label="Bassa" checked={now === 'low'} onChoose={() => set(() => setProp(it, 'priority', 'low', me, instantNow()))} />
        </>;
      }
      if (k === 'assignment') return group ? (
        <AssignChoices current={it.props.assignment?.assignee} me={me} members={[me, ...Object.keys(group.members).filter(m => m !== me)]}
          outside={namesOutside(ws.activities, group.id)}
          onMember={m => set(() => assign(it, m, me, role, instantNow(), true))} onPropose={m => set(() => assign(it, m, me, role, instantNow()))} onName={n => set(() => assignToName(it, n, me, role, instantNow()))} />
      ) : <span className="menu-note">Prima mettila in un gruppo.</span>;
      return <DatePicker label="Scadenza" value={it.props.due?.slice(0, 10) ?? ''} onChange={day => set(() => setProp(it, 'due', day, me, instantNow()))} />;
    };
  }
  const chips: Chip[] = [...(a.groupId === null ? ['groupId' as const] : []), ...rankProps(usage, CHIP_PROPS).filter(k => !a.props[k])];
  // A weekly series says its days and their times in Ripeti: the date it starts from is no row of its own.
  const set = CHIP_PROPS.filter(k => a.props[k] !== undefined && !(isWeekly(a.props.repeat) && (k === 'due' || k === 'schedule')));

  // The assignee is changed from its row by who edits the group; taking it away is the assignee's Lascia, not a removal.
  const editable = (k: PropKey) => canEdit;
  const removable = (k: PropKey) => canEdit && k !== 'assignment';
  // The core refuses to leave a repeat without a date to start from.
  const startsTheSeries = (k: PropKey) => a.props.repeat !== undefined && (k === 'due' || k === 'schedule')
    && (k === 'due' ? a.props.schedule : a.props.due) === undefined;
  // A property already set is edited in place, right under its row; a new one opens under the chips.
  // Its author moves it to another group from the Dove row (a draft gets a group from the chips instead).
  const movable = !isNew && !asGroupList && canEdit && a.groupId !== null && a.accountId === me;
  const editingSet = form !== null && ((set as string[]).includes(form) || (form === 'groupId' && a.groupId !== null));
  // canEdit too: a form left open closes when someone else archives or completes the activity meanwhile.
  const propForm = canEdit && form && form !== 'reject' && form !== 'release' && form !== 'decompose' && form !== 'snooze' && form !== 'moveOccurrence' && (
    <PropertyForm key={form} chip={form} activity={a} group={group} groups={ws.groups} me={me} personalGroupId={personalGroupId} now={instantNow()}
      onApply={next => run(() => next, () => { if (form !== 'groupId' && !editingSet) setUsage(noteUse(me, form)); setForm(null); })}
      onPending={build => { pending.current = build; }} onCancel={PANEL.has(form as Chip) ? () => setForm(null) : undefined} />
  );

  return (
    <article className="detail stack" {...(isNew ? { 'aria-label': 'Nuova attività' } : { 'aria-labelledby': 'detail-h' })}
      onPaste={canEdit ? e => { const f = Array.from(e.clipboardData?.files ?? []); if (f.length) { e.preventDefault(); void addFiles(f); } } : undefined}
      onDragOver={canEdit ? e => e.preventDefault() : undefined}
      onDrop={canEdit ? e => { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); } : undefined}>
      {!asGroupList && <header className="row">
        {/* The way out on the left, as the phone's back: it saves what Chiudi used to save. What to do with the text on the right. */}
        <button type="button" className="icon-choice small" aria-label="Indietro" title="Indietro" onClick={() => void close()}><Icon name="back" size={18} /></button>
        {!isNew && <h2 id="detail-h" className={canEdit ? 'sr-only' : undefined}>{a.title}</h2>}
        {isNew && <button className="btn primary" aria-label="Salva l'attività" disabled={saving || !a.title.trim()} onClick={() => void close()}>Salva</button>}
        {!isNew && <HeaderSwitches activity={a} me={me} alertsOpen={alertsOpen} setAlertsOpen={setAlertsOpen}
          closesItself={a.props.schedule && canEdit ? on => void run(() => setClosesItself(a, on, localNow(), me, instantNow())) : undefined}
          info={a.groupId !== null && canEdit ? on => void run(() => setInfo(a, on, instantNow())) : undefined}
          offCalendar={a.groupId !== null && canEdit ? on => void run(() => setOffCalendar(a, on, instantNow())) : undefined} />}
      </header>}
      {asGroupList && closed && group && can(group, me, 'editActivity') && (
        <button className="btn primary" onClick={() => void ws.save(reopen(a, me, instantNow()))}>Riapri la lista</button>
      )}
      {/* A list group's page starts with the list: it is what the group is for. */}
      {asGroupList && <ChecklistView activity={a} me={me} editable={canEdit} change={next => run(next)} members={listMembers} modelChoice copy={!isNew && <CopyButton activity={a} />} />}
      {isNew ? (
        <div className="text-fields">
          <TitleField autoFocus placeholder="Cosa c'è da fare?" value={a.title} onChange={e => setLocal({ ...a, title: e.target.value })} />
          <textarea className="body-field" aria-label="Testo" placeholder="Aggiungi un testo…" rows={2} value={a.body} onChange={e => setLocal({ ...a, body: e.target.value })} />
        </div>
      ) : canEdit
        ? <TextFields key={a.id} title={a.title} body={a.body} hideTitle={asGroupList} onSave={text => run(() => editText(a, text, me, instantNow()))} />
        : a.body && <p>{a.body}</p>}
      <Links texts={asGroupList ? [a.body] : [a.title, a.body]} />
      {isNew
        ? files.length > 0 && <ul className="attachments">{files.map((f, i) => <li key={i}>{f.name} <button type="button" className="link" aria-label={`Togli ${f.name}`} onClick={() => setFiles(l => l.filter((_, j) => j !== i))}>togli</button></li>)}</ul>
        : <Attachments activity={a} onRemove={canEdit ? id => void run(() => removeAttachment(a, id, me, instantNow())) : undefined} />}
      {!asGroupList && (a.checklist || listOpen) && <ChecklistView activity={a} me={me} editable={canEdit} change={next => run(next)} members={listMembers} typed={isNew ? typedItem : undefined} />}
      <dl className="kv">
        {/* A list group's page says the group above, and a list is always an "idea": neither row tells anything there. */}
        {!asGroupList && <>
          <dt>Forma</dt><dd><span className="pill prop">{SHAPE_LABEL[shape]}</span></dd>
          <PropRow label="Dove" value={group ? `${group.kind === 'personal' ? 'Personale' : group.name} · tu: ${ROLE_LABEL[role]}` : 'bozza, la vedi solo tu'}
            editing={false} menu={movable ? groupChoices : undefined} />
        </>}
        {set.map(k => (
          <PropRow key={k} label={PROP_LABEL[k]} value={describe(a, k)} editing={form === k}
            onEdit={editable(k) && !INLINE.has(k) ? (e => (PANEL.has(k) ? openPanel(k) : setForm(form === k ? null : k))) : undefined}
            panel={PANEL.has(k) ? panelOf(k) : undefined} boxRef={form === k && PANEL.has(k) ? panelBox : undefined}
            menu={editable(k) && INLINE.has(k) ? inlineChoices(k as InlineKey) : undefined}
            onRemove={removable(k) && !startsTheSeries(k) ? () => run(() => removeProp(a, k, me, instantNow())) : undefined}
            note={editable(k) && startsTheSeries(k) ? 'per toglierla, togli prima Ripeti' : undefined} />
        ))}
        {!isNew && !asGroupList && <AlertRow activity={a} me={me} onOpen={() => setAlertsOpen(true)} />}
        {occ && <><dt>Occorrenza</dt><dd>{when(occ.start)} · {occ.assignee ? shortName(occ.assignee) : 'libera'}{occ.coveredFor ? ` (copre ${shortName(occ.coveredFor)})` : ''}{occ.done ? ' · fatta' : ''}{occ.skipped ? ' · saltata' : ''}{movedNote(occ) ? ` · ${movedNote(occ)}` : ''}</dd></>}
      </dl>
      {editingSet && !PANEL.has(form as Chip) && propForm}

      {!isNew && actions.length > 0 && (
        <div className="btns">
          {actions.map(k => (k === 'moveToGroup' ? <PopMenu key={k} className="btn" label={labelOf(k)} menuLabel="Gruppo">{groupChoices}</PopMenu>
            : k === 'snooze' ? (
              <PopMenu key={k} className="btn" label={labelOf(k)} menuLabel="Rimanda" panel>
                {close => <SnoozeForm me={me} onCancel={close} onSnooze={until => { close(); void run(() => snooze(a, until, me, instantNow()), () => onClose()); }} />}
              </PopMenu>
            ) : k === 'reject' || k === 'release' ? (
              // The reason in a panel under the button (2026-11-16); Annulla keeps what was typed, nothing is sent.
              <PopMenu key={k} className="btn" label={labelOf(k)} menuLabel={k === 'reject' ? 'Rifiuta' : 'Lascia'} panel>
                {close => (
                  <form className="form" onSubmit={e => {
                    e.preventDefault();
                    if (k === 'reject' && reason.trim() === '') return;
                    close();
                    void run(() => (k === 'reject' ? reject(a, me, reason, instantNow()) : release(a, me, instantNow(), reason)), () => setReason(''));
                  }}>
                    <input aria-label="Motivo" autoFocus placeholder={k === 'reject' ? 'Perché la rifiuti?' : 'Perché la lasci? (facoltativo)'} value={reason} onChange={e => setReason(e.target.value)} />
                    <PanelActions disabled={k === 'reject' && reason.trim() === ''} applyLabel={k === 'reject' ? 'Rifiuta' : 'Lascia'} onCancel={close} />
                  </form>
                )}
              </PopMenu>
            ) : k === 'moveOccurrence' && occ ? (
              <PopMenu key={k} className="btn" label={labelOf(k)} menuLabel="Sposta questa volta" panel>
                {close => <MoveOccurrenceForm from={occ.start} onCancel={close} onMove={to => { close(); void run(() => moveOccurrence(a, occ.key, to, me, role, instantNow())); }} />}
              </PopMenu>
            ) : <button key={k} className={`btn${PRIMARY.has(k) ? ' primary' : ''}`} onClick={() => act(k)}>{labelOf(k)}</button>))}
        </div>
      )}
      {form === 'decompose' && <DecomposeForm parent={a} onDone={() => onClose()} />}
      {problem && <p className="error" role="alert">{problem}</p>}

      {canEdit && (
        <>
          {/* Most used first: the order says it, the label need not. */}
          <p className="label">Aggiungi proprietà</p>
          <div className="chips">
            {chips.map(k => (k === 'groupId' ? <PopMenu key={k} label="+ Gruppo" menuLabel="Gruppo">{groupChoices}</PopMenu> : INLINE.has(k) ? inlineChip(k as InlineKey) : PANEL.has(k) ? (
              <span key={k} className="attach" ref={form === k ? panelBox : undefined}>
                <button className="chip" aria-pressed={form === k} onClick={e => openPanel(k)}>+ {PROP_LABEL[k as PropKey]}</button>
                {!editingSet && panelOf(k)}
              </span>
            ) : (
              <button key={k} className="chip" aria-pressed={form === k} onClick={() => setForm(form === k ? null : k)}>
                + {PROP_LABEL[k]}
              </button>
            )))}
            {!a.checklist && !listOpen && !asGroupList && <button className="chip" onClick={() => setListOpen(true)}>+ Lista</button>}
            <AttachMenu disabled={saving} onFiles={f => { setProblem(null); void addFiles(f); }} onProblem={setProblem} />
          </div>
          {!editingSet && !PANEL.has(form as Chip) && propForm}
        </>
      )}

      {!isNew && (
        <Disclosure label="Storico">
          <ol className="hist">{[...a.history].reverse().map((h, i) => <li key={i}><time>{h.at.slice(5, 16).replace('T', ' ')}</time> {historyText(h)}</li>)}</ol>
        </Disclosure>
      )}
    </article>
  );
}

/**
 * «Si chiude da sola» (2026-11-16): only on an activity with a date and time; on, the activity is marked done by itself
 * at the end of its time, a series one time after the other. For what is only to know about: «Anna al lavoro 8–17:30».
 */
/**
 * The icons on the right of the detail (user's choice, 2026-11-19): the bell, ⋯ and In evidenza, the last. ⋯ opens a
 * strip with the other switches, Condividi and Copia, the same icons as before, each doing what it did; a switch that
 * is on also shows beside the bell, so what is set is in sight. Before, all were in a row of up to nine icons, that on
 * a phone went past the screen's edge; then for a moment ⋯ was a list of rows with words, «molto brutto».
 */
function HeaderSwitches({ activity: a, me, alertsOpen, setAlertsOpen, closesItself, info, offCalendar }: {
  activity: Activity; me: string; alertsOpen: boolean; setAlertsOpen(open: boolean): void;
  closesItself?: ((on: boolean) => void) | undefined; info?: ((on: boolean) => void) | undefined; offCalendar?: ((on: boolean) => void) | undefined;
}) {
  useBarPrefs();
  const text = useCopyText(a);
  const closesOn = a.closesItself !== undefined;
  const size = rowSizeOf(me, a.id);
  return (
    <span className="row-end">
      <span role="status" className="small muted">{text.said}</span>
      {closesItself && closesOn && <ClosesItselfButton on onToggle={closesItself} />}
      {size !== 'auto' && <RowSizeButton id={a.id} me={me} />}
      {info && a.info === true && <FlagButton on label="Informazione utile" icon="info" title={INFO_TITLE} onToggle={info} />}
      {offCalendar && a.offCalendar === true && <FlagButton on label="Non mostrare in calendario" icon="calendarOff" title={OFF_CALENDAR_TITLE} onToggle={offCalendar} />}
      <AlertButton activity={a} me={me} open={alertsOpen} setOpen={setAlertsOpen} />
      <PopMenu className="icon-choice small" buttonLabel="Altro" title="Altro" label={<Icon name="more" size={18} />} menuLabel="Altro" roomBelow={220}>
        {close => <span className="icon-strip">
          {closesItself && <ClosesItselfButton on={closesOn} onToggle={on => { close(); closesItself(on); }} />}
          <RowSizeButton id={a.id} me={me} onChosen={close} />
          {info && <FlagButton on={a.info === true} label="Informazione utile" icon="info" title={INFO_TITLE} onToggle={on => { close(); info(on); }} />}
          {offCalendar && <FlagButton on={a.offCalendar === true} label="Non mostrare in calendario" icon="calendarOff" title={OFF_CALENDAR_TITLE} onToggle={on => { close(); offCalendar(on); }} />}
          {text.canShare && <button type="button" className="icon-choice small" aria-label="Condividi" title="Condividi" onClick={() => { close(); void text.share(); }}><Icon name="share" size={18} /></button>}
          <button type="button" className="icon-choice small" aria-label="Copia il testo" title="Copia il testo" onClick={() => { close(); void text.copy(); }}><Icon name="copy" size={18} /></button>
        </span>}
      </PopMenu>
      <HighlightButton id={a.id} me={me} />
    </span>
  );
}

const INFO_TITLE = "Informazione utile: da sapere, non da fare; ridotta nell'Agenda, fuori dal Calendario";
const OFF_CALENDAR_TITLE = "Non mostrare in calendario: resta nell'Agenda";

function ClosesItselfButton({ on, onToggle }: { on: boolean; onToggle(on: boolean): void }) {
  return (
    <button type="button" className="icon-choice small" aria-label="Si chiude da sola" aria-pressed={on}
      title="Si chiude da sola: alla fine dell'orario si segna fatta" onClick={() => onToggle(!on)}>
      <Icon name="autoDone" size={18} />
    </button>
  );
}

/**
 * A switch of the group's on the activity (user's choices, 2026-11-17): «Informazione utile», «Non mostrare in
 * calendario». They sit before the star, which stays the last of the switches on the right.
 */
function FlagButton({ on, label, icon, title, onToggle }: { on: boolean; label: string; icon: IconName; title: string; onToggle(on: boolean): void }) {
  return (
    <button type="button" className="icon-choice small" aria-label={label} aria-pressed={on} title={title} onClick={() => onToggle(!on)}>
      <Icon name={icon} size={18} />
    </button>
  );
}

const ROW_SIZES: readonly (readonly [RowSize, string, IconName])[] = [
  ['auto', 'Automatica', 'rowAuto'], ['expanded', 'Sempre espansa', 'rowExpanded'], ['reduced', 'Sempre ridotta', 'rowReduced'],
];

/**
 * How the activity's rows start in the person's Agenda, theirs only: a small menu of three (user's choice, 2026-11-17;
 * before, «Sempre espansa» on or off). Lit when it is not «Automatica», with the arrows open or closed.
 */
function RowSizeButton({ id, me, onChosen }: { id: string; me: string; onChosen?: () => void }) {
  useBarPrefs();
  const size = rowSizeOf(me, id);
  const [, text, icon] = ROW_SIZES.find(([s]) => s === size)!;
  return (
    <PopMenu className={`icon-choice small${size === 'auto' ? '' : ' on'}`} buttonLabel="Riga nell'Agenda" title={`Riga nell'Agenda: ${text}`}
      label={<Icon name={icon} size={18} />} menuLabel="Riga nell'Agenda" roomBelow={24 + 44 * ROW_SIZES.length}>
      {close => ROW_SIZES.map(([s, t, i]) => <MenuChoice key={s} label={t} value={s} icon={<Icon name={i} size={18} />} checked={s === size}
        onChoose={() => { close(); onChosen?.(); setRowSize(me, id, s); }} />)}
    </PopMenu>
  );
}

/** Puts the activity «In evidenza» on top of the person's agenda, and takes it away: theirs only. */
function HighlightButton({ id, me }: { id: string; me: string }) {
  useBarPrefs();
  const on = isHighlighted(me, id);
  return (
    <button type="button" className="icon-choice small highlight" aria-label="In evidenza" aria-pressed={on}
      title={on ? "Togli dall'evidenza" : 'Metti in evidenza'} onClick={() => toggleHighlight(me, id)}>
      <Icon name="highlight" size={18} />
    </button>
  );
}

function PropRow({ label, value, editing, onEdit, onRemove, note, menu, panel, boxRef }: {
  label: string; value: string; editing: boolean; onEdit?: ((e: React.MouseEvent<HTMLButtonElement>) => void) | undefined; onRemove?: (() => void) | undefined; note?: string | undefined;
  /** The panel open under the value, over the page, and the box a press outside of closes it. */
  panel?: ReactNode; boxRef?: React.Ref<HTMLSpanElement> | undefined;
  /** The value opens this menu under itself instead of a form under the row. */
  menu?: ((close: () => void) => ReactNode) | undefined;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {menu ? <PopMenu className="link value" buttonLabel={`Modifica ${label}`} label={value} menuLabel={label}>{menu}</PopMenu>
          : onEdit ? (
            <span className="attach" ref={boxRef}>
              <button className="link value" aria-label={`Modifica ${label}`} aria-expanded={editing} onClick={onEdit}>{value}</button>
              {panel}
            </span>
          ) : value}
        {onRemove && <button className="link" aria-label={`Togli ${label}`} onClick={onRemove}>togli</button>}
        {note && <span className="muted"> · {note}</span>}
      </dd>
    </>
  );
}

const scheduleTime = (p: Activity['props']) => p.schedule ? { start: p.schedule.start.slice(11, 16), ...(p.schedule.end ? { end: p.schedule.end.slice(11, 16) } : {}) } : undefined;

/**
 * A date as the Agenda writes it, «lun 16 nov» or «gio 20 nov 08:00», the year only when it is not this one (user's
 * choice, 2026-11-18). Before, as the engine keeps it, «2026-11-16» or «2026-11-20 08:00».
 */
const when = (at: string | undefined): string => (at ? `${shortDay(at.slice(0, 10))}${at.length > 10 ? ` ${at.slice(11, 16)}` : ''}` : '');

function describe(a: Activity, k: PropKey): string {
  const p = a.props;
  switch (k) {
    case 'due': return when(p.due);
    case 'schedule': return p.schedule ? when(p.schedule.start) + (p.schedule.end ? `–${p.schedule.end.slice(11)}` : '') : '';
    case 'repeat': return p.repeat ? describeRepeat(p.repeat, scheduleTime(p), anchorOf(a)) + (p.repeat.mode === 'fromCompletion' ? ` · prossima ${when(nextDue(a))}` : '') : '';
    case 'assignment': return !p.assignment ? '' : p.assignment.external ? p.assignment.assignee
      : `${shortName(p.assignment.assignee)} · ${p.assignment.state === 'proposed' ? `proposta da ${shortName(p.assignment.assignedBy)}` : 'accettata'}`;
    case 'waitingFor': return p.waitingFor ? p.waitingFor.condition + (p.waitingFor.metAt ? ` · avverata da ${shortName(p.waitingFor.metBy ?? '')}` : '') : '';
    case 'priority': return p.priority ? PRIORITY_LABEL[p.priority] : '';
    default: return '';
  }
}

/** The names outside the group its activities were given to, most used first: they come back as choices. */
function namesOutside(activities: readonly Activity[], groupId: string): string[] {
  const used = new Map<string, number>();
  for (const x of activities) {
    const asg = x.props.assignment;
    if (x.groupId === groupId && asg?.external) used.set(asg.assignee, (used.get(asg.assignee) ?? 0) + 1);
  }
  return [...used.entries()].sort((x, y) => y[1] - x[1]).map(([n]) => n);
}

/**
 * Assegna's menu: «a me», the members, the names outside used before in the group, and «Altro nome…», a field for
 * someone outside (user's choice, 2026-11-16). A typed name that is already a choice («me», «a me», a member's short
 * name, a name used before) is that choice, in any case. A member's name gives it at once; «proposta» beside it asks
 * first, to be accepted (user's choice, 2026-11-18; before, the name proposed and there was no way to give it at once).
 */
function AssignChoices({ current, me, members, outside, onMember, onPropose, onName }: {
  current: string | undefined; me: string; members: readonly string[]; outside: readonly string[];
  onMember(account: string): void; onPropose(account: string): void; onName(name: string): void;
}) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState('');
  const label = (m: string) => (m === me ? 'a me' : shortName(m));
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = name.trim().toLocaleLowerCase('it');
    if (!t) return;
    const member = members.find(m => label(m).toLocaleLowerCase('it') === t || shortName(m).toLocaleLowerCase('it') === t || (t === 'me' && m === me));
    if (member) return onMember(member);
    onName(outside.find(n => n.toLocaleLowerCase('it') === t) ?? name.trim());
  }
  return <>
    {members.map(m => (m === me ? <MenuChoice key={m} label={label(m)} checked={current === m} onChoose={() => onMember(m)} /> : (
      <span key={m} className="assign-row">
        <MenuChoice label={label(m)} checked={current === m} onChoose={() => onMember(m)} />
        <button type="button" className="chip small" aria-label={`Proponi a ${label(m)}`} title="Proposta: deve accettarla" onClick={() => onPropose(m)}>proposta</button>
      </span>
    )))}
    {outside.map(n => <MenuChoice key={`name:${n}`} label={n} checked={current === n} onChoose={() => onName(n)} />)}
    {typing ? (
      <form onSubmit={submit}>
        <input aria-label="Altro nome" placeholder="Nome…" autoFocus value={name} onChange={e => setName(e.target.value)} />
      </form>
    ) : <button type="button" className="who-other" onClick={() => setTyping(true)}>Altro nome…</button>}
  </>;
}
