import { useState } from 'react';
import { addMember, can, groupTypeOf, leaveGroup, reopen, roleIn } from '@attivita/core';
import { shapeOf } from '@attivita/core';
import type { Activity, Group, GroupType, Role, Shape } from '@attivita/core';
import { waitingIn } from './listGroup.js';
import { KIND_COLOR } from '../agenda/AgendaView.js';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { MAX_PINS, movePin, orderSharedGroups, pin, pinsOf, setIcon, unpin, useBarPrefs } from './barPrefs.js';
import { GroupIcon } from './GroupIcon.js';
import { GroupName } from './GroupName.js';
import { ManagedBy } from './ManagedBy.js';
import { GROUP_ICON_SECTIONS, Icon } from '../shell/icons.js';
import { instantNow, newId } from '../dates.js';
import { KIND_LABEL, errorText, shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { configFromInvite, googleConfigOf, inviteLink } from '../session/google-config.js';
import { useWs } from '../workspace/useWorkspace.js';
import { GoogleGroupWizard, InviteLink, appBase } from './GoogleGroupWizard.js';

export const groupName = (g: Group) => (g.kind === 'personal' ? 'Idee personali' : g.name);

/**
 * Noi: the shared groups (the personal one is in Io). The pinned ones first, in the bar's order with arrows to move them;
 * then the others, each with its pin. `onOpenGroup` opens a group's page, `onNewActivity` a new activity in it.
 */
export function GroupsView({ onOpenGroup = () => undefined, onNewActivity = () => undefined }: { onOpenGroup?(groupId: string): void; onNewActivity?(groupId: string): void } = {}) {
  const ws = useWs();
  const { account } = useSession();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [where, setWhere] = useState<'central' | 'google'>('central');
  const [type, setType] = useState<GroupType>('activities');
  const [problem, setProblem] = useState<string | null>(null);
  const [invite] = useState(() => configFromInvite(window.location.search));
  const [wizard, setWizard] = useState(invite !== null);
  useBarPrefs();
  const pins = pinsOf(account);
  const shared = orderSharedGroups(ws.groups, account);
  const pinned = shared.filter(g => pins.includes(g.id));
  const others = shared.filter(g => !pins.includes(g.id));
  const pinOne = (id: string) => setProblem(pin(account, id) ? null : `In barra ci stanno ${MAX_PINS} gruppi: togline uno prima.`);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    // On Google the wizard makes the group, once the project is connected; it gets the name already written.
    if (where === 'google') { setCreating(false); setWizard(true); return; }
    const g: Group = {
      id: `inv:${newId()}`, kind: 'invite', name: name.trim(), ownerId: account,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome', members: { [account]: 'owner' }, version: 1,
      ...(type === 'list' ? { type } : {}),
    };
    try { await ws.saveGroup(g); setCreating(false); setName(''); setType('activities'); } catch (err) { setProblem(errorText(err)); }
  }

  return (
    <section aria-labelledby="groups-h" className="stack">
      <h2 id="groups-h">Noi</h2>
      {pinned.length > 0 ? (
        <>
          <ul className="pinned" aria-label="In barra">
            {pinned.map((g, i) => (
              <li key={g.id}>
                <GroupCard group={g} onOpenGroup={onOpenGroup} onNewActivity={onNewActivity} pinControls={<>
                  <button className="icon-choice" aria-label={`Sposta su ${g.name}`} title="Sposta su" disabled={i === 0} onClick={() => movePin(account, g.id, -1)}><Icon name="up" /></button>
                  <button className="icon-choice" aria-label={`Sposta giù ${g.name}`} title="Sposta giù" disabled={i === pinned.length - 1} onClick={() => movePin(account, g.id, 1)}><Icon name="down" /></button>
                  <button className="icon-choice" aria-label={`Togli ${g.name} dalla barra`} title="Togli dalla barra" onClick={() => { unpin(account, g.id); setProblem(null); }}><Icon name="unpin" /></button>
                </>} />
              </li>
            ))}
          </ul>
        </>
      ) : <p className="muted small">Metti in barra i gruppi che vuoi sempre a portata; gli altri posti li prendono i più usati.</p>}
      {others.map(g => (
        <GroupCard key={g.id} group={g} onOpenGroup={onOpenGroup} onNewActivity={onNewActivity}
          pinControls={<button className="icon-choice" aria-label={`Metti ${g.name} in barra`} title="Metti in barra" onClick={() => pinOne(g.id)}><Icon name="pin" /></button>} />
      ))}
      {creating ? (
        <form className="card stack new-group" onSubmit={create}>
          <label htmlFor="new-group" className="label">Nome del nuovo gruppo</label>
          <input id="new-group" aria-label="Nome" required autoFocus value={name} onChange={e => setName(e.target.value)} />
          <fieldset className="where">
            <legend className="label">Tipo</legend>
            <label><input type="radio" name="type" checked={type === 'activities'} onChange={() => setType('activities')} /> Attività</label>
            <label><input type="radio" name="type" checked={type === 'list'} onChange={() => setType('list')} /> Lista</label>
          </fieldset>
          <fieldset className="where">
            <legend className="label">Dove stanno i dati</legend>
            <label><input type="radio" name="where" checked={where === 'central'} onChange={() => setWhere('central')} /> Gestito da terzi</label>
            <label><input type="radio" name="where" checked={where === 'google'} onChange={() => setWhere('google')} /> Gestione privata</label>
            <p className="muted small">Gestito da terzi: i dati stanno sul server di chi pubblica questa app; il gruppo è pronto subito.<br />
              Gestione privata: i dati stanno nel tuo account Google; va collegato un progetto Firebase, circa 5 minuti.</p>
          </fieldset>
          <div className="btns">
            <button className="btn primary" type="submit" disabled={!name.trim()}>{where === 'google' ? 'Continua su Google' : 'Crea'}</button>
            <button className="btn" type="button" onClick={() => setCreating(false)}>Annulla</button>
          </div>
        </form>
      ) : !wizard && (
        <button className="icon-choice" aria-label="Nuovo gruppo condiviso" title="Nuovo gruppo condiviso" onClick={() => setCreating(true)}><Icon name="newGroup" /></button>
      )}
      {wizard && <GoogleGroupWizard invite={invite ?? undefined} initialName={name.trim()} type={type} onDone={() => { setWizard(false); setName(''); setType('activities'); }} />}
      {problem && <p className="error" role="alert">{problem}</p>}
    </section>
  );
}

function GroupCard({ group: g, onOpenGroup, onNewActivity, pinControls }: { group: Group; onOpenGroup(groupId: string): void; onNewActivity(groupId: string): void; pinControls?: React.ReactNode }) {
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
  const [picking, setPicking] = useState(false);
  const choose = (icon: Parameters<typeof setIcon>[2]) => { setIcon(session.account, g.id, icon); setPicking(false); };
  const waiting = waitingIn(g, ws.activities);
  const isList = groupTypeOf(g) === 'list';
  const [problem, setProblem] = useState<string | null>(null);
  const label = groupName(g);
  const canLeave = g.kind !== 'personal' && g.ownerId !== account;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try { await ws.saveGroup(addMember(g, email.trim().toLowerCase(), role, account)); setInviting(false); setEmail(''); setProblem(null); } catch (err) { setProblem(errorText(err)); }
  }

  /** Activities is the absence of a type, as on groups made before types. */
  async function retype(t: GroupType) {
    const { type: _old, ...rest } = g;
    try { await ws.saveGroup(t === 'list' ? { ...rest, type: t } : rest); setProblem(null); } catch (err) { setProblem(errorText(err)); }
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
      <header className="row">
        <button className="grp-icon pick" aria-label={`Icona di ${label}`} aria-expanded={picking} onClick={() => setPicking(v => !v)}><GroupIcon group={g} account={session.account} /></button>
        <GroupName group={g} label={label} account={account} level="h3" />
        <span className="pills"><span className="pill">{KIND_LABEL[g.kind]}</span><ManagedBy groupId={g.id} /></span>
        {pinControls && <span className="pin-controls">{pinControls}</span>}
      </header>
      {picking && (
        <div className="icon-grid" role="group" aria-label={`Scegli l'icona di ${label}`}>
          <div className="icon-section">
            <button className="icon-choice" aria-label="Iniziale" title="Iniziale" onClick={() => choose(null)}><span className="initial">{label.charAt(0).toUpperCase()}</span></button>
          </div>
          {GROUP_ICON_SECTIONS.map(sec => (
            <div key={sec.title} className="icon-section" role="group" aria-label={sec.title}>
              <p className="label">{sec.title}</p>
              <div className="icon-row">
                {sec.icons.map(i => <button key={i.name} className="icon-choice" aria-label={i.label} title={i.label} onClick={() => choose(i.name)}><Icon name={i.name} /></button>)}
              </div>
            </div>
          ))}
        </div>
      )}
      {g.kind === 'invite' && roleIn(g, account) === 'owner' && (
        <div className="seg" role="radiogroup" aria-label={`Tipo di ${label}`}>
          {([['activities', 'Attività'], ['list', 'Lista']] as const).map(([t, words]) => (
            <button key={t} role="radio" aria-checked={groupTypeOf(g) === t}
              onClick={() => { if (groupTypeOf(g) !== t) void retype(t); }}>{words}</button>
          ))}
        </div>
      )}
      <p className="muted small">{Object.entries(g.members).map(([m, r]) => `${m === account ? 'tu' : shortName(m)}${r === 'member' ? '' : ` (${r === 'owner' ? 'proprietario' : 'ospite'})`}`).join(' · ')}</p>
      <div className="btns">
        <button className="icon-choice count" aria-label={`Elenco di ${label}`} title="Elenco" onClick={() => onOpenGroup(g.id)}><Icon name={isList ? 'task' : 'list'} />{waiting.n > 0 && <span>{waiting.n}</span>}</button>
        {can(g, account, 'invite') && <button className="icon-choice" aria-label={`Invita in ${label}`} title="Invita" aria-expanded={inviting} onClick={() => setInviting(v => !v)}><Icon name="invite" /></button>}
        {!isList && can(g, account, 'editActivity') && <button className="icon-choice" aria-label={`Nuova attività in ${label}`} title="Nuova attività" onClick={() => onNewActivity(g.id)}><Icon name="plus" /></button>}
        {canLeave && !leaving && <button className="icon-choice" aria-label={`Esci da ${label}`} title="Esci dal gruppo" onClick={() => setLeaving(true)}><Icon name="leave" /></button>}
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

/**
 * The done and the archived activities, under two closed rows at the bottom of a list: the most recent first, each with
 * an icon to reopen it when `canReopen` says the person may.
 */
export function ClosedLists({ activities, canReopen, onOpen }: { activities: Activity[]; canReopen(a: Activity): boolean; onOpen(t: OpenTarget): void }) {
  const ws = useWs();
  const { account } = useSession();
  const [problem, setProblem] = useState<string | null>(null);
  const recent = [...activities].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  const sections: Array<[string, Activity[]]> = [['Fatte', recent.filter(a => a.status === 'done')], ['Archiviate', recent.filter(a => a.status === 'archived')]];
  const back = async (a: Activity) => {
    try { await ws.save(reopen(a, ws.engineOf(a.groupId ?? '')?.account ?? account, instantNow())); setProblem(null); } catch (e) { setProblem(errorText(e)); }
  };
  return (
    <>
      {sections.filter(([, list]) => list.length > 0).map(([title, list]) => (
        <details key={title} className="closed" aria-label={`${title} (${list.length})`}>
          <summary>{title} ({list.length})</summary>
          <ul className="items">
            {list.map(a => (
              <li key={a.id} className="closed-row">
                <button className="item" style={{ '--grp': 'var(--muted)' } as React.CSSProperties} onClick={() => onOpen({ activityId: a.id })}>
                  <span className="bar" /><span><span className="t">{a.title}</span></span><span className="time">{a.updatedAt.slice(5, 10).split('-').reverse().join('/')}</span>
                </button>
                {canReopen(a) && <button className="icon-choice small" aria-label={`Riapri ${a.title}`} title="Riapri" onClick={() => void back(a)}><Icon name="reopen" /></button>}
              </li>
            ))}
          </ul>
        </details>
      ))}
      {problem && <p className="error" role="alert">{problem}</p>}
    </>
  );
}
