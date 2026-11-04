import { buildAgenda, resumeIfDue } from '@attivita/core';
import type { AgendaItem, GroupKind, LocalDate } from '@attivita/core';
import { addDays, dayParts, instantNow, localNow, today } from '../dates.js';
import { shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

export const KIND_COLOR: Record<GroupKind, string> = { domain: 'var(--acc-dom)', invite: 'var(--acc-inv)', personal: 'var(--acc-per)' };

export interface OpenTarget {
  activityId: string;
  occurrenceKey?: string;
}

export function AgendaView({ from = today(), days = 14, onOpen }: { from?: LocalDate; days?: number; onOpen(t: OpenTarget): void }) {
  const { account } = useSession();
  const ws = useWs();
  const now = localNow();
  const sources = ws.groups.map(group => ({
    group, activities: ws.activities.filter(a => a.groupId === group.id).map(a => resumeIfDue(a, now, instantNow())),
  }));
  const agenda = buildAgenda(sources, `${from}T00:00`, `${addDays(from, days - 1)}T23:59`);
  const groupOf = (id: string) => ws.groups.find(g => g.id === id);

  if (!ws.loaded) return <p className="muted">Carico l'agenda…</p>;
  return (
    <section aria-labelledby="agenda-h" className="stack">
      <h2 id="agenda-h">Agenda</h2>
      {Object.keys(agenda.days).length === 0 && <p className="muted">Niente in agenda nelle prossime due settimane. Premi + per catturare un'idea.</p>}
      {Object.entries(agenda.days).map(([day, items]) => {
        const p = dayParts(day);
        return (
          <div key={day} className={`day${day === today() ? ' today' : ''}`}>
            <div className="d">{p.weekday}<b>{p.day}</b>{p.month}</div>
            <ul className="items">
              {items.map(it => <li key={`${it.activityId}|${it.key}`}><Item it={it} kind={groupOf(it.groupId)?.kind ?? 'personal'} group={groupOf(it.groupId)?.name ?? ''} me={account} onOpen={onOpen} /></li>)}
            </ul>
          </div>
        );
      })}
      <h2 id="waiting-h">In attesa</h2>
      {agenda.waiting.length === 0 ? <p className="muted">Nessun memo in attesa.</p> : (
        <ul className="items" aria-labelledby="waiting-h">
          {agenda.waiting.map(a => (
            <li key={a.id}>
              <button className="item" style={{ '--grp': KIND_COLOR[groupOf(a.groupId!)?.kind ?? 'personal'] } as React.CSSProperties} onClick={() => onOpen({ activityId: a.id })}>
                <span className="bar" /><span><span className="t">{a.title}</span><br /><span className="meta">aspetta: {a.props.waitingFor?.condition}</span></span>
                <span className="time">{groupOf(a.groupId!)?.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Item({ it, kind, group, me, onOpen }: { it: AgendaItem; kind: GroupKind; group: string; me: string; onOpen(t: OpenTarget): void }) {
  const who = it.assignee ? (it.assignee === me ? 'tu' : shortName(it.assignee)) : 'libera';
  return (
    <button className={`item${it.done ? ' done' : ''}`} style={{ '--grp': KIND_COLOR[kind] } as React.CSSProperties}
      onClick={() => onOpen({ activityId: it.activityId, occurrenceKey: it.key })}>
      <span className="bar" />
      <span>
        <span className="t">{it.title}</span><br />
        <span className="meta">{group} · {who}</span>
        {it.coveredFor && <span className="pill cover">copre {shortName(it.coveredFor)}</span>}
        {it.done && <span className="pill ok">fatta</span>}
      </span>
      <span className="time">{it.start.length > 10 ? it.start.slice(11) : 'giorno'}</span>
    </button>
  );
}
