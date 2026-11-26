import { addLabel, can, groupLabels, labelOf, withGroupLabels } from '@attivita/core';
import type { Group } from '@attivita/core';
import { useState } from 'react';
import { instantNow, newId } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

/** A group's labels (2026-11-26): its list, «memo» until someone changes it. */
export function useGroupLabels(groupId: string | null): string[] {
  const ws = useWs();
  return groupId === null ? [] : groupLabels(ws.labelSets, groupId);
}

/**
 * The group's labels on its page in Noi (user's choices, 2026-11-26): one word in lower case each, «memo» from the
 * start; who edits the group's activities adds or takes them away. An activity keeps a label taken away, unseen.
 */
export function GroupLabels({ group: g }: { group: Group }) {
  const ws = useWs();
  const session = useSession();
  const account = ws.engineOf(g.id)?.account ?? session.account;
  const labels = useGroupLabels(g.id);
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const editable = can(g, account, 'editActivity');
  const save = async (next: string[]) => {
    try { await ws.save(withGroupLabels(ws.labelSets, g.id, next, newId(), account, instantNow())); setProblem(null); return true; } catch (e) { setProblem(errorText(e)); return false; }
  };
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    let next: string[];
    try { next = addLabel(labels, text); } catch (err) { setProblem(errorText(err)); return; }
    if (await save(next)) setText('');
  };
  return (
    <section className="group-labels" aria-label={`Etichette di ${g.name}`}>
      <p className="label">Etichette</p>
      {labels.length === 0 ? <p className="muted small">Nessuna etichetta.</p> : (
        <ul className="pills" aria-label="Etichette del gruppo">
          {labels.map(l => (
            <li key={l} className="pill tag">{l}
              {editable && <button type="button" className="link" aria-label={`Togli ${l}`} onClick={() => void save(labels.filter(x => x !== l))}>×</button>}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <form className="vault-fields" onSubmit={e => void add(e)}>
          <input aria-label="Nuova etichetta" placeholder="Una parola, es. casa" value={text} maxLength={30} onChange={e => setText(labelOf(e.target.value))} />
          <button type="submit" className="btn" disabled={!text}>Aggiungi</button>
        </form>
      )}
      {problem && <p className="error" role="alert">{problem}</p>}
    </section>
  );
}
