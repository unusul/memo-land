import { useRef, useState } from 'react';
import { readBytes } from '../capture/CaptureSheet.js';
import { shrinkImage } from '../capture/images.js';
import { enqueueDraft } from '../offline/outbox.js';
import type { QueuedFile } from '../offline/outbox.js';
import {
  accept, archive, backToDraft, can, claim, complete, editText, keepAsIdea, markConditionMet, nextDue, occurrencesBetween, rankProps,
  reject, release, removeProp, reopen, roleIn, shapeOf, snooze, takeOccurrence,
} from '@attivita/core';
import type { Activity, PropKey } from '@attivita/core';
import { instantNow, localNow } from '../dates.js';
import { PROP_LABEL, ROLE_LABEL, SHAPE_LABEL, errorText, historyText, shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { loadUsage, noteUse } from '../usage/usageStore.js';
import { useWs } from '../workspace/useWorkspace.js';
import { availableActions } from './actions.js';
import { Attachments } from './Attachments.js';
import { ChecklistView } from './ChecklistView.js';
import { CopyButton } from './CopyButton.js';
import { Disclosure } from '../shell/Disclosure.js';
import { SnoozeForm } from './SnoozeForm.js';
import { describeRepeat } from './timing.js';
import type { ActionKind } from './actions.js';
import { DecomposeForm } from './DecomposeForm.js';
import { TextFields } from './TextFields.js';
import { PropertyForm } from './PropertyForms.js';
import type { Chip } from './PropertyForms.js';

const CHIP_PROPS: readonly PropKey[] = ['due', 'schedule', 'repeat', 'assignment', 'waitingFor'];
const ACTION_LABEL: Record<ActionKind, string> = {
  accept: 'Accetta', reject: 'Rifiuta…', release: 'Lascia…', claim: 'Me la prendo', cover: 'Copro io questa', complete: 'Fatto',
  met: 'Segna avverata', moveToGroup: 'Sposta in un gruppo', keepAsIdea: 'Tienila come idea', decompose: 'Scomponi…',
  snooze: 'Rimanda…', archive: 'Archivia', toDraft: 'Torna bozza',
};
/** Highlighted only where someone waits for the person's answer: a proposal to accept. */
const PRIMARY: ReadonlySet<ActionKind> = new Set<ActionKind>(['accept']);
/** What Chiudi says after saving a form left open. */
const SAVED: Record<Chip, string> = {
  due: 'Scadenza salvata', schedule: 'Data e ora salvata', repeat: 'Ripeti salvato', assignment: 'Assegnazione salvata',
  waitingFor: 'Attesa salvata', resumeAt: 'Rimando salvato', parentId: 'Attività madre salvata', groupId: 'Gruppo salvato',
};

/**
 * `onClose(message)` tells the shell what Chiudi saved, if anything. With `fresh` the detail is a new activity of a group,
 * kept here until it has a title and is saved (Salva, or Chiudi): the properties are set on it meanwhile, nothing is stored.
 * With `asGroupList` it is a list group's own activity, shown as the group's page: no Chiudi and no title (the group's
 * name is above), the list always open, and nothing that would take it out of the group.
 */
export function ActivityDetail({ activityId, occurrenceKey, fresh, asGroupList = false, onClose }: {
  activityId: string; occurrenceKey?: string; fresh?: Activity; asGroupList?: boolean; onClose(message?: string): void;
}) {
  const { account: me, personalGroupId, outbox } = useSession();
  const ws = useWs();
  const [local, setLocal] = useState<Activity | null>(fresh ?? null);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const picker = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Chip | 'reject' | 'release' | 'decompose' | 'snooze' | null>(null);
  const [reason, setReason] = useState('');
  const [usage, setUsage] = useState(() => loadUsage(me));
  const [problem, setProblem] = useState<string | null>(null);
  // The open property form's change, if any: Chiudi saves it instead of dropping it.
  const pending = useRef<(() => Activity) | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const a = local ?? [...ws.activities, ...ws.drafts].find(x => x.id === activityId);
  const isNew = local !== null;
  if (!a) return ws.loaded ? <p className="muted">Questa attività non c'è più o non è visibile per te.</p> : <p className="muted">Carico…</p>;
  const group = a.groupId ? ws.groups.find(g => g.id === a.groupId) ?? null : null;
  const role = group ? roleIn(group, me) ?? 'guest' : 'owner';
  const occ = occurrenceKey ? occurrencesBetween(a, occurrenceKey.length > 10 ? occurrenceKey : `${occurrenceKey}T00:00`, occurrenceKey.length > 10 ? occurrenceKey : `${occurrenceKey}T23:59`)[0] ?? null : null;
  const shape = shapeOf(a, personalGroupId);
  const actions = (a.status === 'open' && !group?.archived ? availableActions(a, occ, group, me) : []).filter(k => !asGroupList || (k !== 'archive' && k !== 'toDraft'));
  // A done or archived activity is read only: it is reopened from the list it sits in.
  const closed = a.status !== 'open';
  // An archived group is read only too, until its owner reopens it.
  const canEdit = !closed && !group?.archived && (a.groupId === null || (group !== null && role !== 'guest'));

  // On a list group the button says what completing does: the list ends, or starts again when it repeats.
  const labelOf = (k: ActionKind) => (asGroupList && k === 'complete' ? (a.props.repeat ? 'Completa e ricomincia' : 'Completa la lista') : ACTION_LABEL[k]);

  async function run(change: () => Activity, after?: () => void): Promise<boolean> {
    try {
      setProblem(null);
      const next = change();
      if (isNew) setLocal(next);
      else if (next !== a) await ws.save(next);
      after?.();
      return true;
    } catch (e) {
      setProblem(errorText(e));
      return false;
    }
  }

  async function close() {
    if (isNew) return create(pending.current ? pending.current() : a!);
    const next = pending.current;
    if (!next || !form || form === 'reject' || form === 'release' || form === 'decompose' || form === 'snooze') return onClose(undefined);
    if (await run(next)) onClose(SAVED[form]);
  }

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

  async function addFiles(incoming: File[]) {
    const limits = ws.engineOf(a!.groupId!)?.limits;
    for (const f of incoming) {
      // A file the browser cannot shrink keeps its size, and the limit below still applies.
      const small = limits ? await shrinkImage(f, limits).catch(() => f) : f;
      if (limits && small.size > limits.maxAttachmentBytes) setProblem(`L'allegato ${f.name} è troppo grande anche dopo la riduzione: non l'ho aggiunto.`);
      else setFiles(l => [...l, small]);
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
      case 'complete': return run(() => complete(it, me, occ?.key ?? localNow(), now, occ?.key));
      case 'met': return run(() => markConditionMet(it, me, role, now));
      case 'moveToGroup': return setForm('groupId');
      case 'keepAsIdea': return run(() => keepAsIdea(it, personalGroupId, me, now));
      case 'decompose': return setForm('decompose');
      case 'snooze': return setForm('snooze');
      case 'archive': return run(() => archive(it, me, now), () => onClose());
      case 'toDraft': return run(() => backToDraft(it, me, now), () => onClose('Rimessa fra le bozze'));
    }
  }

  const chips: Chip[] = [...(a.groupId === null ? ['groupId' as const] : []), ...rankProps(usage, CHIP_PROPS).filter(k => !a.props[k])];
  const set = CHIP_PROPS.filter(k => a.props[k] !== undefined);

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
  const propForm = canEdit && form && form !== 'reject' && form !== 'release' && form !== 'decompose' && form !== 'snooze' && (
    <PropertyForm key={form} chip={form} activity={a} group={group} groups={ws.groups} me={me} personalGroupId={personalGroupId} now={instantNow()}
      onApply={next => run(() => next, () => { if (form !== 'groupId' && !editingSet) setUsage(noteUse(me, form)); setForm(null); })}
      onPending={build => { pending.current = build; }} />
  );

  return (
    <article className="detail stack" {...(isNew ? { 'aria-label': 'Nuova attività' } : { 'aria-labelledby': 'detail-h' })}
      onPaste={isNew ? e => { const f = Array.from(e.clipboardData?.files ?? []); if (f.length) { e.preventDefault(); void addFiles(f); } } : undefined}
      onDragOver={isNew ? e => e.preventDefault() : undefined}
      onDrop={isNew ? e => { e.preventDefault(); void addFiles(Array.from(e.dataTransfer.files)); } : undefined}>
      {!asGroupList && <header className="row">
        {!isNew && <h2 id="detail-h" className={canEdit ? 'sr-only' : undefined}>{a.title}</h2>}
        {isNew && <button className="btn primary" aria-label="Salva l'attività" disabled={saving || !a.title.trim()} onClick={() => void close()}>Salva</button>}
        {!isNew && <CopyButton activity={a} />}
        <button className="link" onClick={() => void close()}>Chiudi</button>
      </header>}
      {asGroupList && closed && group && can(group, me, 'editActivity') && (
        <button className="btn primary" onClick={() => void ws.save(reopen(a, me, instantNow()))}>Riapri la lista</button>
      )}
      {/* A list group's page starts with the list: it is what the group is for. */}
      {asGroupList && <ChecklistView activity={a} me={me} editable={canEdit} change={next => run(next)} copy={!isNew && <CopyButton activity={a} />} />}
      {isNew ? (
        <div className="text-fields">
          <input className="title-field" aria-label="Titolo" autoFocus placeholder="Cosa c'è da fare?" value={a.title} onChange={e => setLocal({ ...a, title: e.target.value })} />
          <textarea className="body-field" aria-label="Testo" placeholder="Aggiungi un testo…" rows={2} value={a.body} onChange={e => setLocal({ ...a, body: e.target.value })} />
        </div>
      ) : canEdit
        ? <TextFields key={a.id} title={a.title} body={a.body} hideTitle={asGroupList} onSave={text => run(() => editText(a, text, me, instantNow()))} />
        : a.body && <p>{a.body}</p>}
      {isNew ? (
        <>
          {files.length > 0 && <ul className="attachments">{files.map((f, i) => <li key={i}>{f.name} <button type="button" className="link" aria-label={`Togli ${f.name}`} onClick={() => setFiles(l => l.filter((_, j) => j !== i))}>togli</button></li>)}</ul>}
          <input ref={picker} type="file" multiple accept="image/*,*/*" hidden onChange={e => { void addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
        </>
      ) : <Attachments activity={a} />}
      {!asGroupList && (a.checklist || listOpen) && <ChecklistView activity={a} me={me} editable={canEdit} change={next => run(next)} />}
      <dl className="kv">
        {/* A list group's page says the group above, and a list is always an "idea": neither row tells anything there. */}
        {!asGroupList && <>
          <dt>Forma</dt><dd><span className="pill prop">{SHAPE_LABEL[shape]}</span></dd>
          <PropRow label="Dove" value={group ? `${group.kind === 'personal' ? 'Idee personali' : group.name} · tu: ${ROLE_LABEL[role]}` : 'bozza, la vedi solo tu'}
            editing={form === 'groupId'} onEdit={movable ? () => setForm(form === 'groupId' ? null : 'groupId') : undefined} />
        </>}
        {set.map(k => (
          <PropRow key={k} label={PROP_LABEL[k]} value={describe(a, k)} editing={form === k}
            onEdit={editable(k) ? () => setForm(form === k ? null : k) : undefined}
            onRemove={removable(k) && !startsTheSeries(k) ? () => run(() => removeProp(a, k, me, instantNow())) : undefined}
            note={editable(k) && startsTheSeries(k) ? 'per toglierla, togli prima Ripeti' : undefined} />
        ))}
        {occ && <><dt>Occorrenza</dt><dd>{occ.start.replace('T', ' ')} · {occ.assignee ? shortName(occ.assignee) : 'libera'}{occ.coveredFor ? ` (copre ${shortName(occ.coveredFor)})` : ''}{occ.done ? ' · fatta' : ''}</dd></>}
      </dl>
      {editingSet && propForm}

      {!isNew && actions.length > 0 && (
        <div className="btns">
          {actions.map(k => <button key={k} className={`btn${PRIMARY.has(k) ? ' primary' : ''}`} onClick={() => act(k)}>{labelOf(k)}</button>)}
        </div>
      )}
      {form === 'reject' && (
        <form className="form" onSubmit={e => { e.preventDefault(); void run(() => reject(a, me, reason, instantNow()), () => { setForm(null); setReason(''); }); }}>
          <input aria-label="Motivo" placeholder="Perché la rifiuti?" value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn primary" type="submit" disabled={reason.trim() === ''}>Rifiuta</button>
        </form>
      )}
      {form === 'release' && (
        <form className="form" onSubmit={e => { e.preventDefault(); void run(() => release(a, me, instantNow(), reason), () => { setForm(null); setReason(''); }); }}>
          <input aria-label="Motivo" placeholder="Perché la lasci? (facoltativo)" value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn primary" type="submit">Lascia</button>
        </form>
      )}
      {form === 'decompose' && <DecomposeForm parent={a} onDone={() => onClose()} />}
      {form === 'snooze' && <SnoozeForm me={me} onSnooze={until => run(() => snooze(a, until, me, instantNow()), () => onClose())} />}
      {problem && <p className="error" role="alert">{problem}</p>}

      {canEdit && (
        <>
          {/* Most used first: the order says it, the label need not. */}
          <p className="label">Aggiungi proprietà</p>
          <div className="chips">
            {chips.map(k => (
              <button key={k} className="chip" aria-pressed={form === k} onClick={() => setForm(form === k ? null : k)}>
                + {k === 'groupId' ? 'Gruppo' : PROP_LABEL[k]}
              </button>
            ))}
            {!a.checklist && !listOpen && !asGroupList && <button className="chip" onClick={() => setListOpen(true)}>+ Lista</button>}
            {isNew && <button className="chip" onClick={() => picker.current?.click()}>+ Foto o file</button>}
          </div>
          {!editingSet && propForm}
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

function PropRow({ label, value, editing, onEdit, onRemove, note }: {
  label: string; value: string; editing: boolean; onEdit?: (() => void) | undefined; onRemove?: (() => void) | undefined; note?: string | undefined;
}) {
  return (
    <>
      <dt>{label}</dt>
      <dd>
        {onEdit ? <button className="link value" aria-label={`Modifica ${label}`} aria-expanded={editing} onClick={onEdit}>{value}</button> : value}
        {onRemove && <button className="link" aria-label={`Togli ${label}`} onClick={onRemove}>togli</button>}
        {note && <span className="muted"> · {note}</span>}
      </dd>
    </>
  );
}

function describe(a: Activity, k: PropKey): string {
  const p = a.props;
  switch (k) {
    case 'due': return p.due ?? '';
    case 'schedule': return p.schedule ? p.schedule.start.replace('T', ' ') + (p.schedule.end ? `–${p.schedule.end.slice(11)}` : '') : '';
    case 'repeat': return p.repeat ? describeRepeat(p.repeat) + (p.repeat.mode === 'fromCompletion' ? ` · prossima ${nextDue(a)}` : '') : '';
    case 'assignment': return p.assignment ? `${shortName(p.assignment.assignee)} · ${p.assignment.state === 'proposed' ? `proposta da ${shortName(p.assignment.assignedBy)}` : 'accettata'}` : '';
    case 'waitingFor': return p.waitingFor ? p.waitingFor.condition + (p.waitingFor.metAt ? ` · avverata da ${shortName(p.waitingFor.metBy ?? '')}` : '') : '';
    default: return '';
  }
}
