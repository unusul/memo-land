import { useState } from 'react';
import { roleIn } from '@attivita/core';
import type { AccountId, Group } from '@attivita/core';
import { errorText } from '../labels.js';
import { Icon } from '../shell/icons.js';
import { useWs } from '../workspace/useWorkspace.js';

/**
 * A group's name as a heading, with a pencil to rename it where the person may: the owner of an invite group, as both
 * engines allow. A domain group is named after its domain; the personal group is not renamed.
 */
export function GroupName({ group: g, label, account, level }: { group: Group; label: string; account: AccountId; level: 'h2' | 'h3' }) {
  const ws = useWs();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(g.name);
  const [problem, setProblem] = useState<string | null>(null);
  const Heading = level;
  const mayRename = g.kind === 'invite' && !g.archived && roleIn(g, account) === 'owner';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try { await ws.saveGroup({ ...g, name: name.trim() }); setEditing(false); setProblem(null); } catch (err) { setProblem(errorText(err)); }
  }

  if (!editing) {
    return (
      <span className="group-name">
        <Heading>{label}</Heading>
        {mayRename && <button className="icon-choice small" aria-label={`Rinomina ${label}`} title="Rinomina" onClick={() => { setName(g.name); setEditing(true); }}><Icon name="edit" /></button>}
      </span>
    );
  }
  return (
    <form className="group-name" onSubmit={save}>
      <input aria-label="Nome del gruppo" autoFocus value={name} onChange={e => setName(e.target.value)} />
      <button type="submit" className="icon-choice small" aria-label="Salva il nome" title="Salva" disabled={!name.trim()}><Icon name="check" /></button>
      <button type="button" className="icon-choice small" aria-label="Annulla" title="Annulla" onClick={() => setEditing(false)}><Icon name="close" /></button>
      {problem && <p className="error" role="alert">{problem}</p>}
    </form>
  );
}
