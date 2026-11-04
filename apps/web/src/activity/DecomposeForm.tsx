import { useState } from 'react';
import { archive, decompose } from '@attivita/core';
import type { Activity, Props } from '@attivita/core';
import { instantNow, newId, today } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

type Kind = 'event' | 'task' | 'recurring';
interface Row { title: string; kind: Kind; when: string }

const KIND_LABEL: Record<Kind, string> = { event: 'evento', task: 'cosa da fare', recurring: 'ricorrente (1 e 15 del mese)' };

function propsFor(r: Row): Props {
  if (r.kind === 'event') return { schedule: { start: r.when.length > 10 ? r.when : `${r.when}T09:00` } };
  if (r.kind === 'recurring') return { due: r.when.slice(0, 10), repeat: { mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' } };
  return { due: r.when.slice(0, 10) };
}

/** Splits a draft into several activities of different shapes; the draft is archived afterwards. */
export function DecomposeForm({ parent, onDone }: { parent: Activity; onDone(): void }) {
  const { account, personalGroupId } = useSession();
  const ws = useWs();
  const [groupId, setGroupId] = useState(ws.groups.find(g => g.kind === 'domain')?.id ?? personalGroupId);
  const [rows, setRows] = useState<Row[]>([{ title: '', kind: 'event', when: `${today()}T10:00` }]);
  const [problem, setProblem] = useState<string | null>(null);
  const update = (i: number, patch: Partial<Row>) => setRows(rs => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const now = instantNow();
      const r = decompose(parent, rows.filter(x => x.title.trim()).map(x => ({ id: newId(), title: x.title.trim(), groupId, props: propsFor(x) })), account, now);
      for (const child of r.children) await ws.save(child);
      await ws.save(archive(r.parent, account, now));
      onDone();
    } catch (err) {
      setProblem(errorText(err));
    }
  }

  return (
    <form className="stack decompose" onSubmit={submit}>
      <label>Gruppo <select value={groupId} onChange={e => setGroupId(e.target.value)}>
        {ws.groups.map(g => <option key={g.id} value={g.id}>{g.kind === 'personal' ? 'Idee personali' : g.name}</option>)}
      </select></label>
      {rows.map((r, i) => (
        <fieldset key={i} className="form">
          <input aria-label={`Titolo ${i + 1}`} placeholder="Titolo" value={r.title} onChange={e => update(i, { title: e.target.value })} />
          <select aria-label={`Tipo ${i + 1}`} value={r.kind} onChange={e => update(i, { kind: e.target.value as Kind })}>
            {(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
          <input aria-label={`Quando ${i + 1}`} type={r.kind === 'event' ? 'datetime-local' : 'date'} value={r.kind === 'event' ? r.when : r.when.slice(0, 10)} onChange={e => update(i, { when: e.target.value })} />
        </fieldset>
      ))}
      <div className="btns">
        <button type="button" className="btn" onClick={() => setRows(rs => [...rs, { title: '', kind: 'task', when: today() }])}>Un'altra</button>
        <button type="submit" className="btn primary" disabled={!rows.some(r => r.title.trim())}>Scomponi</button>
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
    </form>
  );
}
