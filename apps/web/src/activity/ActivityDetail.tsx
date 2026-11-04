import { useState } from 'react';
import {
  accept, addUnits, archive, claim, complete, keepAsIdea, markConditionMet, nextDue, occurrencesBetween, rankProps,
  reject, removeProp, roleIn, shapeOf, snooze, takeOccurrence,
} from '@attivita/core';
import type { Activity, LocalDate, PropKey } from '@attivita/core';
import { instantNow, localNow, today } from '../dates.js';
import { PROP_LABEL, SHAPE_LABEL, errorText, historyText, shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { loadUsage, noteUse } from '../usage/usageStore.js';
import { useWs } from '../workspace/useWorkspace.js';
import { availableActions } from './actions.js';
import type { ActionKind } from './actions.js';
import { DecomposeForm } from './DecomposeForm.js';
import { PropertyForm } from './PropertyForms.js';
import type { Chip } from './PropertyForms.js';

const CHIP_PROPS: readonly PropKey[] = ['due', 'schedule', 'repeat', 'assignment', 'waitingFor'];
const ACTION_LABEL: Record<ActionKind, string> = {
  accept: 'Accetta', reject: 'Rifiuta…', claim: 'Me la prendo', cover: 'Copro io questa', complete: 'Fatto',
  met: 'Segna avverata', moveToGroup: 'Sposta in un gruppo', keepAsIdea: 'Tienila come idea', decompose: 'Scomponi…',
  snooze: 'Riprendi tra un mese', archive: 'Archivia',
};
const PRIMARY: ReadonlySet<ActionKind> = new Set<ActionKind>(['accept', 'complete', 'met']);

export function ActivityDetail({ activityId, occurrenceKey, onClose }: { activityId: string; occurrenceKey?: string; onClose(): void }) {
  const { account: me, personalGroupId } = useSession();
  const ws = useWs();
  const [form, setForm] = useState<Chip | 'reject' | 'decompose' | null>(null);
  const [reason, setReason] = useState('');
  const [usage, setUsage] = useState(() => loadUsage(me));
  const [problem, setProblem] = useState<string | null>(null);

  const a = [...ws.activities, ...ws.drafts].find(x => x.id === activityId);
  if (!a) return ws.loaded ? <p className="muted">Questa attività non c'è più o non è visibile per te.</p> : <p className="muted">Carico…</p>;
  const group = a.groupId ? ws.groups.find(g => g.id === a.groupId) ?? null : null;
  const role = group ? roleIn(group, me) ?? 'guest' : 'owner';
  const occ = occurrenceKey ? occurrencesBetween(a, occurrenceKey.length > 10 ? occurrenceKey : `${occurrenceKey}T00:00`, occurrenceKey.length > 10 ? occurrenceKey : `${occurrenceKey}T23:59`)[0] ?? null : null;
  const shape = shapeOf(a, personalGroupId);
  const actions = availableActions(a, occ, group, me);
  const canEdit = a.groupId === null || (group !== null && role !== 'guest');

  async function run(change: () => Activity, after?: () => void) {
    try {
      setProblem(null);
      await ws.save(change());
      after?.();
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  function act(kind: ActionKind) {
    const now = instantNow();
    const it: Activity = a!;
    switch (kind) {
      case 'accept': return run(() => accept(it, me, now));
      case 'reject': return setForm('reject');
      case 'claim': return run(() => claim(it, me, role, now));
      case 'cover': return run(() => takeOccurrence(it, occ!.key, me, role, now));
      case 'complete': return run(() => complete(it, me, occ?.key ?? localNow(), now, occ?.key));
      case 'met': return run(() => markConditionMet(it, me, role, now));
      case 'moveToGroup': return setForm('groupId');
      case 'keepAsIdea': return run(() => keepAsIdea(it, personalGroupId, me, now));
      case 'decompose': return setForm('decompose');
      case 'snooze': return run(() => snooze(it, addUnits(today(), 'month', 1) as LocalDate, me, now), onClose);
      case 'archive': return run(() => archive(it, me, now), onClose);
    }
  }

  const chips: Chip[] = [...(a.groupId === null ? ['groupId' as const] : []), ...rankProps(usage, CHIP_PROPS).filter(k => !a.props[k])];
  const set = CHIP_PROPS.filter(k => a.props[k] !== undefined);

  return (
    <article className="detail stack" aria-labelledby="detail-h">
      <header className="row">
        <h2 id="detail-h">{a.title}</h2>
        <button className="link" onClick={onClose}>Chiudi</button>
      </header>
      {a.body && <p>{a.body}</p>}
      {a.attachments.length > 0 && <ul className="attachments">{a.attachments.map(f => <li key={f.id}>{f.name}</li>)}</ul>}
      <dl className="kv">
        <dt>Forma</dt><dd><span className="pill prop">{SHAPE_LABEL[shape]}</span></dd>
        <dt>Dove</dt><dd>{group ? `${group.kind === 'personal' ? 'Idee personali' : group.name} · tu: ${role}` : 'bozza, la vedi solo tu'}</dd>
        {set.map(k => (
          <PropRow key={k} label={PROP_LABEL[k]} value={describe(a, k)}
            onRemove={canEdit && k !== 'assignment' ? () => run(() => removeProp(a, k, me, instantNow())) : undefined} />
        ))}
        {occ && <><dt>Occorrenza</dt><dd>{occ.start.replace('T', ' ')} · {occ.assignee ? shortName(occ.assignee) : 'libera'}{occ.coveredFor ? ` (copre ${shortName(occ.coveredFor)})` : ''}{occ.done ? ' · fatta' : ''}</dd></>}
      </dl>

      {actions.length > 0 && (
        <div className="btns">
          {actions.map(k => <button key={k} className={`btn${PRIMARY.has(k) ? ' primary' : ''}`} onClick={() => act(k)}>{ACTION_LABEL[k]}</button>)}
        </div>
      )}
      {form === 'reject' && (
        <form className="form" onSubmit={e => { e.preventDefault(); void run(() => reject(a, me, reason, instantNow()), () => { setForm(null); setReason(''); }); }}>
          <input aria-label="Motivo" placeholder="Perché la rifiuti?" value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn primary" type="submit" disabled={reason.trim() === ''}>Rifiuta</button>
        </form>
      )}
      {form === 'decompose' && <DecomposeForm parent={a} onDone={onClose} />}
      {problem && <p className="error" role="alert">{problem}</p>}

      {canEdit && (
        <>
          <p className="label">Aggiungi proprietà · le più usate prima</p>
          <div className="chips">
            {chips.map(k => (
              <button key={k} className="chip" aria-pressed={form === k} onClick={() => setForm(form === k ? null : k)}>
                + {k === 'groupId' ? 'Gruppo' : PROP_LABEL[k]}{k !== 'groupId' && usage[k] ? <span className="n">×{usage[k]}</span> : null}
              </button>
            ))}
          </div>
          {form && form !== 'reject' && form !== 'decompose' && (
            <PropertyForm key={form} chip={form} activity={a} group={group} groups={ws.groups} me={me} personalGroupId={personalGroupId} now={instantNow()}
              onApply={next => run(() => next, () => { if (form !== 'groupId') setUsage(noteUse(me, form)); setForm(null); })} />
          )}
        </>
      )}

      <p className="label">Storico</p>
      <ol className="hist">{[...a.history].reverse().map((h, i) => <li key={i}><time>{h.at.slice(5, 16).replace('T', ' ')}</time> {historyText(h)}</li>)}</ol>
    </article>
  );
}

function PropRow({ label, value, onRemove }: { label: string; value: string; onRemove?: (() => void) | undefined }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}{onRemove && <button className="link" aria-label={`Togli ${label}`} onClick={onRemove}>togli</button>}</dd>
    </>
  );
}

function describe(a: Activity, k: PropKey): string {
  const p = a.props;
  switch (k) {
    case 'due': return p.due ?? '';
    case 'schedule': return p.schedule ? p.schedule.start.replace('T', ' ') + (p.schedule.end ? `–${p.schedule.end.slice(11)}` : '') : '';
    case 'repeat': return p.repeat?.mode === 'fromCompletion' ? `ogni ${p.repeat.every.count} mese dal completamento · prossima ${nextDue(a)}` : `a calendario (${p.repeat?.rrule})`;
    case 'assignment': return p.assignment ? `${shortName(p.assignment.assignee)} · ${p.assignment.state === 'proposed' ? `proposta da ${shortName(p.assignment.assignedBy)}` : 'accettata'}` : '';
    case 'waitingFor': return p.waitingFor ? p.waitingFor.condition + (p.waitingFor.metAt ? ` · avverata da ${shortName(p.waitingFor.metBy ?? '')}` : '') : '';
    default: return '';
  }
}
