import { useEffect, useState } from 'react';
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
import { KIND_LABEL, ROLE_LABEL, errorText, shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { configFromInvite, googleConfigOf, inviteLink } from '../session/google-config.js';
import { useWs } from '../workspace/useWorkspace.js';
import { useBackLayer } from '../shell/back.js';
import { SwipeRow } from '../shell/SwipeRow.js';
import { GoogleGroupWizard, InviteLink, appBase } from './GoogleGroupWizard.js';

export const groupName = (g: Group) => (g.kind === 'personal' ? 'Idee personali' : g.name);

/**
 * Noi: the shared groups (the personal one is in Io), one row each: tapping the row opens the group, ⋯ opens its
 * management page. The groups in the bar first, in the bar's order, then the others; the archived under a closed row.
 * Before, each group was a tall card with all its buttons, and the way into the group was an unclear count icon.
 */
export function GroupsView({ onOpenGroup = () => undefined }: { onOpenGroup?(groupId: string): void } = {}) {
  const ws = useWs();
  const { account, demo } = useSession();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [where, setWhere] = useState<'central' | 'google'>('central');
  const [type, setType] = useState<GroupType>('activities');
  const [problem, setProblem] = useState<string | null>(null);
  const [invite] = useState(() => configFromInvite(window.location.search));
  const [wizard, setWizard] = useState(invite !== null);
  // The group whose management page is open; the phone's back returns to the rows.
  const [managing, setManaging] = useState<string | null>(null);
  useBackLayer(managing !== null, () => setManaging(null));
  useBarPrefs();
  const pins = pinsOf(account);
  const shared = orderSharedGroups(ws.groups, account);
  const archived = ws.groups.filter(g => g.kind !== 'personal' && g.archived).sort((x, y) => x.name.localeCompare(y.name, 'it'));
  /** Archiving and reopening are the owner's: absent `archived` is a group in use, as on groups made before. */
  async function setArchived(g: Group, on: boolean) {
    const { archived: _old, ...rest } = g;
    try { await ws.saveGroup(on ? { ...rest, archived: true } : rest); setProblem(null); } catch (err) { setProblem(errorText(err)); }
  }
  const pinned = shared.filter(g => pins.includes(g.id));
  const others = shared.filter(g => !pins.includes(g.id));
  // A group left, or archived, from its page is no longer one to manage: back to the rows.
  const managed = managing ? shared.find(g => g.id === managing) : undefined;
  useEffect(() => { if (managing && !managed) setManaging(null); }, [managing, managed]);

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

  if (managed) {
    const at = pinned.findIndex(g => g.id === managed.id);
    return (
      <GroupManage group={managed} onBack={() => setManaging(null)} onArchive={() => void setArchived(managed, true)} problem={problem}
        bar={{
          at, count: pinned.length,
          pin: () => setProblem(pin(account, managed.id) ? null : `In barra ci stanno ${MAX_PINS} gruppi: togline uno prima.`),
          unpin: () => { unpin(account, managed.id); setProblem(null); },
          move: by => movePin(account, managed.id, by),
        }} />
    );
  }

  const rows = (list: Group[]) => list.map(g => <GroupRow key={g.id} group={g} onOpen={() => onOpenGroup(g.id)} onManage={() => { setProblem(null); setManaging(g.id); }} />);
  return (
    <section aria-labelledby="groups-h" className="stack">
      <div className="noi-head">
        <h2 id="groups-h">Noi</h2>
        {!creating && !wizard && <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Nuovo gruppo</button>}
      </div>
      {creating && (
        <form className="card stack new-group" onSubmit={create}>
          <label htmlFor="new-group" className="label">Nome del nuovo gruppo</label>
          <input id="new-group" aria-label="Nome" required autoFocus value={name} onChange={e => setName(e.target.value)} />
          <fieldset className="where">
            <legend className="label">Tipo</legend>
            <label><input type="radio" name="type" checked={type === 'activities'} onChange={() => setType('activities')} /> Attività</label>
            <label><input type="radio" name="type" checked={type === 'list'} onChange={() => setType('list')} /> Lista</label>
          </fieldset>
          {/* A group on Google needs a real Google account: in the demo new groups stay in memory. */}
          {!demo && <fieldset className="where">
            <legend className="label">Dove stanno i dati</legend>
            <label><input type="radio" name="where" checked={where === 'central'} onChange={() => setWhere('central')} /> Gestito da terzi</label>
            <label><input type="radio" name="where" checked={where === 'google'} onChange={() => setWhere('google')} /> Gestione privata</label>
            <p className="muted small">Gestito da terzi: i dati stanno sul server di chi pubblica questa app; il gruppo è pronto subito.<br />
              Gestione privata: i dati stanno nel tuo account Google; va collegato un progetto Firebase, circa 5 minuti.</p>
          </fieldset>}
          <div className="btns">
            <button className="btn primary" type="submit" disabled={!name.trim()}>{where === 'google' ? 'Continua su Google' : 'Crea'}</button>
            <button className="btn" type="button" onClick={() => setCreating(false)}>Annulla</button>
          </div>
        </form>
      )}
      {wizard && <GoogleGroupWizard invite={invite ?? undefined} initialName={name.trim()} type={type} onDone={() => { setWizard(false); setName(''); setType('activities'); }} />}
      {pinned.length > 0 && <>
        <p className="label">In barra</p>
        <ul className="group-rows" aria-label="In barra">{rows(pinned)}</ul>
      </>}
      {others.length > 0 && <>
        {pinned.length > 0 && <p className="label">Altri gruppi</p>}
        <ul className="group-rows" aria-label="Altri gruppi">{rows(others)}</ul>
      </>}
      {archived.length > 0 && (
        <details className="closed" aria-label={`Archiviati (${archived.length})`}>
          <summary>Archiviati ({archived.length})</summary>
          <ul className="items">
            {archived.map(g => (
              <li key={g.id} className="closed-row">
                <button className="item" style={{ '--grp': 'var(--muted)' } as React.CSSProperties} onClick={() => onOpenGroup(g.id)}>
                  <span className="bar" /><span><span className="t">{g.name}</span></span><span />
                </button>
                {roleIn(g, ws.engineOf(g.id)?.account ?? account) === 'owner' && (
                  <button className="icon-choice small" aria-label={`Riapri ${g.name}`} title="Riapri il gruppo" onClick={() => void setArchived(g, false)}><Icon name="reopen" /></button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {problem && <p className="error" role="alert">{problem}</p>}
    </section>
  );
}

const people = (n: number) => (n === 1 ? '1 persona' : `${n} persone`);

/** One group in Noi: the row opens it, ⋯ opens its management page; swiped, towards the right opens, towards the left manages. */
function GroupRow({ group: g, onOpen, onManage }: { group: Group; onOpen(): void; onManage(): void }) {
  const ws = useWs();
  const { account } = useSession();
  const label = groupName(g);
  const { n, words } = waitingIn(g, ws.activities);
  const what = groupTypeOf(g) === 'list' ? 'lista' : KIND_LABEL[g.kind];
  return (
    <li style={{ '--grp': KIND_COLOR[g.kind] } as React.CSSProperties}>
      <SwipeRow right={{ label: 'Apri', icon: 'chevron', tone: 'go', run: onOpen }} left={{ label: 'Gestisci', icon: 'more', tone: 'go', run: onManage }}>
      <div className="group-row">
      <button className="group-open" aria-label={`Apri ${label}${n ? `, ${words}` : ''}`} onClick={onOpen}>
        <span className="grp-icon" aria-hidden="true"><GroupIcon group={g} account={account} /></span>
        <span className="group-names"><span className="t">{label}</span><span className="muted small">{what} · {people(Object.keys(g.members).length)}</span></span>
        {n > 0 && <span className="group-n" aria-hidden="true">{n}</span>}
      </button>
      <button className="icon-choice small" aria-label={`Gestisci ${label}`} title="Gestisci" onClick={onManage}><Icon name="more" size={18} /></button>
      </div>
      </SwipeRow>
    </li>
  );
}

interface BarPlace { at: number; count: number; pin(): void; unpin(): void; move(by: -1 | 1): void }

/**
 * A group's management page, from ⋯ in Noi: name and icon, what it holds, the people and the invitations, its place in
 * the bar, archive or leave. The controls keep the names they had on the old card.
 */
function GroupManage({ group: g, onBack, onArchive, bar, problem: outer }: { group: Group; onBack(): void; onArchive(): void; bar: BarPlace; problem: string | null }) {
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
  const [problem, setProblem] = useState<string | null>(null);
  const label = groupName(g);
  const mine = roleIn(g, account);
  const owner = g.kind === 'invite' && mine === 'owner';
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
    <article aria-label={label} className="card stack manage" style={{ '--grp': KIND_COLOR[g.kind] } as React.CSSProperties}>
      <header className="manage-head">
        <button type="button" className="icon-choice small" aria-label="Indietro" title="Indietro" onClick={onBack}><Icon name="back" size={18} /></button>
        <button className="grp-icon pick" aria-label={`Icona di ${label}`} aria-expanded={picking} onClick={() => setPicking(v => !v)}><GroupIcon group={g} account={session.account} /></button>
        <GroupName group={g} label={label} account={account} level="h2" />
      </header>
      <p className="muted small manage-info">
        <span className="pills"><span className="pill">{KIND_LABEL[g.kind]}</span><ManagedBy groupId={g.id} /></span>
        {mine && <span>tu: {ROLE_LABEL[mine]}</span>}
      </p>
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
      {owner && <>
        <p className="label">Cosa contiene</p>
        <div className="seg" role="radiogroup" aria-label={`Tipo di ${label}`}>
          {([['activities', 'Attività'], ['list', 'Lista']] as const).map(([t, words]) => (
            <button key={t} role="radio" aria-checked={groupTypeOf(g) === t}
              onClick={() => { if (groupTypeOf(g) !== t) void retype(t); }}>{words}</button>
          ))}
        </div>
      </>}
      <p className="label">Persone</p>
      <ul className="people">
        {Object.entries(g.members).map(([m, r]) => <li key={m}><span>{m === account ? 'tu' : shortName(m)}</span><span className="muted small">{ROLE_LABEL[r]}</span></li>)}
      </ul>
      {can(g, account, 'invite') && !inviting && <button className="btn" aria-label={`Invita in ${label}`} onClick={() => setInviting(true)}><Icon name="invite" size={18} /> Invita</button>}
      {inviting && (
        <form className="form" onSubmit={invite}>
          <input aria-label="Email" type="email" required autoFocus placeholder="nome@esempio.it" value={email} onChange={e => setEmail(e.target.value)} />
          <select aria-label="Ruolo" value={role} onChange={e => setRole(e.target.value as Role)}>
            <option value="member">membro</option>
            <option value="guest">ospite</option>
          </select>
          <button className="btn primary" type="submit" disabled={!email.trim()}>Invia invito</button>
          <button className="btn" type="button" onClick={() => setInviting(false)}>Annulla</button>
        </form>
      )}
      {google && can(g, account, 'invite') && <InviteLink link={inviteLink(google, appBase())} />}
      <p className="label">Barra in basso</p>
      {bar.at >= 0 ? (
        <div className="kv-row">
          <span>In barra, {bar.at + 1}° posto</span>
          <span className="icon-row">
            <button className="icon-choice small" aria-label={`Sposta su ${label}`} title="Sposta su" disabled={bar.at === 0} onClick={() => bar.move(-1)}><Icon name="up" size={18} /></button>
            <button className="icon-choice small" aria-label={`Sposta giù ${label}`} title="Sposta giù" disabled={bar.at === bar.count - 1} onClick={() => bar.move(1)}><Icon name="down" size={18} /></button>
            <button className="btn" aria-label={`Togli ${label} dalla barra`} onClick={bar.unpin}>Togli</button>
          </span>
        </div>
      ) : (
        <div className="kv-row">
          <span className="muted small">Non è in barra: ci va da solo se lo usi spesso.</span>
          <button className="btn" aria-label={`Metti ${label} in barra`} onClick={bar.pin}><Icon name="pin" size={18} /> Metti in barra</button>
        </div>
      )}
      {(owner || canLeave) && <p className="label">Altro</p>}
      <div className="btns">
        {owner && <button className="btn" aria-label={`Archivia ${label}`} onClick={onArchive}><Icon name="archive" size={18} /> Archivia il gruppo</button>}
        {canLeave && !leaving && <button className="btn" aria-label={`Esci da ${label}`} onClick={() => setLeaving(true)}><Icon name="leave" size={18} /> Esci dal gruppo</button>}
        {leaving && <>
          <span className="small">Le attività assegnate a te torneranno libere.</span>
          <button className="btn primary" onClick={() => void leave()}>Conferma uscita</button>
          <button className="btn" onClick={() => setLeaving(false)}>Annulla</button>
        </>}
      </div>
      {(problem ?? outer) && <p className="error" role="alert">{problem ?? outer}</p>}
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
