import { useState } from 'react';
import { addMember, can, leaveGroup } from '@attivita/core';
import { shapeOf } from '@attivita/core';
import type { Activity, Group, Role, Shape } from '@attivita/core';
import { KIND_COLOR } from '../agenda/AgendaView.js';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { orderGroups } from './order.js';
import { instantNow, newId } from '../dates.js';
import { KIND_LABEL, errorText, shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { configFromInvite, googleConfigOf, inviteLink } from '../session/google-config.js';
import { useWs } from '../workspace/useWorkspace.js';
import { GoogleGroupWizard, InviteLink, appBase } from './GoogleGroupWizard.js';

export const groupName = (g: Group) => (g.kind === 'personal' ? 'Idee personali' : g.name);

/** All groups, the most used first; `onOpenGroup` opens a group's page with its activities. */
export function GroupsView({ onOpenGroup = () => undefined }: { onOpenGroup?(groupId: string): void } = {}) {
  const ws = useWs();
  const { account } = useSession();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [invite] = useState(() => configFromInvite(window.location.search));
  const [wizard, setWizard] = useState(invite !== null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const g: Group = {
      id: `inv:${newId()}`, kind: 'invite', name: name.trim(), ownerId: account,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome', members: { [account]: 'owner' }, version: 1,
    };
    try { await ws.saveGroup(g); setCreating(false); setName(''); } catch (err) { setProblem(errorText(err)); }
  }

  return (
    <section aria-labelledby="groups-h" className="stack">
      <h2 id="groups-h">Gruppi</h2>
      {orderGroups(ws.groups, account).map(g => <GroupCard key={g.id} group={g} onOpenGroup={onOpenGroup} />)}
      {creating ? (
        <form className="form" onSubmit={create}>
          <label htmlFor="new-group">Nome</label>
          <input id="new-group" required value={name} onChange={e => setName(e.target.value)} />
          <button className="btn primary" type="submit" disabled={!name.trim()}>Crea</button>
          <button className="btn" type="button" onClick={() => setCreating(false)}>Annulla</button>
        </form>
      ) : <div className="btns">
        <button className="btn" onClick={() => setCreating(true)}>Nuovo gruppo</button>
        {!wizard && <button className="btn" onClick={() => setWizard(true)}>Nuovo gruppo su Google</button>}
      </div>}
      {wizard && <GoogleGroupWizard invite={invite ?? undefined} onDone={() => setWizard(false)} />}
      {problem && <p className="error" role="alert">{problem}</p>}
    </section>
  );
}

function GroupCard({ group: g, onOpenGroup }: { group: Group; onOpenGroup(groupId: string): void }) {
  const ws = useWs();
  const session = useSession();
  const engine = ws.engineOf(g.id);
  // On a Google project the identity is the Google account that signed in there.
  const account = engine?.account ?? session.account;
  const google = googleConfigOf(engine);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [leaving, setLeaving] = useState(false);
  const open = ws.activities.filter(a => a.groupId === g.id && a.status === 'open');
  const [problem, setProblem] = useState<string | null>(null);
  const label = groupName(g);
  const canLeave = g.kind !== 'personal' && g.ownerId !== account;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try { await ws.saveGroup(addMember(g, email.trim().toLowerCase(), role, account)); setInviting(false); setEmail(''); setProblem(null); } catch (err) { setProblem(errorText(err)); }
  }

  async function leave() {
    try {
      const { group, changed } = leaveGroup(g, account, ws.activities.filter(a => a.groupId === g.id), 'uscito dal gruppo', instantNow());
      for (const a of changed) await ws.save(a);
      await ws.saveGroup(group);
    } catch (err) {
      setProblem(errorText(err));
    }
  }

  return (
    <article aria-label={label} className="card" style={{ '--grp': KIND_COLOR[g.kind] } as React.CSSProperties}>
      <header className="row"><h3>{label}</h3><span className="pill">{KIND_LABEL[g.kind]}</span></header>
      <p className="muted small">{Object.entries(g.members).map(([m, r]) => `${m === account ? 'tu' : shortName(m)}${r === 'member' ? '' : ` (${r === 'owner' ? 'proprietario' : 'ospite'})`}`).join(' · ')}</p>
      <div className="btns">
        <button className="btn" aria-label={`Elenco di ${label}`} onClick={() => onOpenGroup(g.id)}>Elenco ({open.length})</button>
        {can(g, account, 'invite') && <button className="btn" aria-label={`Invita in ${label}`} onClick={() => setInviting(v => !v)}>Invita</button>}
        {canLeave && !leaving && <button className="btn" aria-label={`Esci da ${label}`} onClick={() => setLeaving(true)}>Esci</button>}
        {leaving && <>
          <span className="small">Le attività assegnate a te torneranno libere.</span>
          <button className="btn primary" onClick={() => void leave()}>Conferma uscita</button>
          <button className="btn" onClick={() => setLeaving(false)}>Annulla</button>
        </>}
      </div>
      {inviting && (
        <form className="form" onSubmit={invite}>
          <input aria-label="Email" type="email" required placeholder="nome@esempio.it" value={email} onChange={e => setEmail(e.target.value)} />
          <select aria-label="Ruolo" value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="member">membro</option>
            <option value="guest">ospite</option>
          </select>
          <button className="btn primary" type="submit" disabled={!email.trim()}>Invia invito</button>
        </form>
      )}
      {google && can(g, account, 'invite') && <InviteLink link={inviteLink(google, appBase())} />}
      {problem && <p className="error" role="alert">{problem}</p>}
    </article>
  );
}

/** Section titles of a group's list, in the order they are shown. */
const LIST_SECTIONS: Array<[Shape, string]> = [
  ['task', 'Cose da fare'], ['recurring', 'Ricorrenti'], ['event', 'Eventi'], ['idea', 'Idee'], ['waiting', 'In attesa'], ['snoozed', 'Rimandate'],
];

/** Every open activity of the group, dated or not, by form: the way to reach ideas and tasks with no date. */
export function GroupList({ label, group: g, activities, onOpen }: { label: string; group: Group; activities: Activity[]; onOpen(t: OpenTarget): void }) {
  const byShape = new Map<Shape, Activity[]>();
  for (const a of activities) {
    const shape = shapeOf(a, g.id);
    byShape.set(shape, [...(byShape.get(shape) ?? []), a]);
  }
  return (
    <section aria-label={`Elenco di ${label}`} className="group-list">
      {activities.length === 0 && <p className="muted small">Nessuna attività aperta.</p>}
      {LIST_SECTIONS.filter(([shape]) => byShape.has(shape)).map(([shape, title]) => (
        <div key={shape} className="attention">
          <h4>{title}</h4>
          <ul className="items">
            {byShape.get(shape)!.map(a => (
              <li key={a.id}>
                <button className="item" style={{ '--grp': KIND_COLOR[g.kind] } as React.CSSProperties} onClick={() => onOpen({ activityId: a.id })}>
                  <span className="bar" /><span><span className="t">{a.title}</span>{a.checklist && a.checklist.items.length > 0 && <><br /><span className="meta">lista {a.checklist.items.filter(i => i.done).length}/{a.checklist.items.length}</span></>}</span>
                  <span className="time">{a.props.due ?? a.props.schedule?.start.replace('T', ' ') ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
