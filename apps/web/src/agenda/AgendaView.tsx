import { useEffect, useState } from 'react';
import { buildAgenda, needsAttention } from '@attivita/core';
import { highlightsOf, isExpanded, setHighlights, useBarPrefs } from '../groups/barPrefs.js';
import type { Activity, AgendaItem, GroupKind, LocalDate } from '@attivita/core';
import { addDays, dayParts, today } from '../dates.js';
import { shortName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { useAgendaSources } from './sources.js';
import { useQuickActions } from './quickActions.js';
import { SwipeRow } from '../shell/SwipeRow.js';
import { movedNote } from '../activity/occurrence.js';
import { Icon } from '../shell/icons.js';

export const KIND_COLOR: Record<GroupKind, string> = { domain: 'var(--acc-dom)', invite: 'var(--acc-inv)', personal: 'var(--acc-per)' };

export interface OpenTarget {
  activityId: string;
  occurrenceKey?: string | undefined;
  /** A form to open ready: the date, after the swipe «Sposta la data». */
  form?: 'due' | 'schedule';
}

/** What «Mostra altre due settimane» adds at each tap (user's choice, 2026-11-16). */
const MORE_DAYS = 14;

export function AgendaView({ from = today(), days = 14, onOpen }: { from?: LocalDate; days?: number; onOpen(t: OpenTarget): void }) {
  const { account } = useSession();
  // Two weeks at the start, kept short; the button at the bottom of the days shows two more each time.
  const [shown, setShown] = useState(days);
  const ws = useWs();
  const sources = useAgendaSources();
  const attention = needsAttention(sources, account, today());
  const agenda = buildAgenda(sources, `${from}T00:00`, `${addDays(from, shown - 1)}T23:59`);
  const groupOf = (id: string | null) => (id === null ? undefined : ws.groups.find(g => g.id === id));
  const quick = useQuickActions(onOpen);
  const highlighted = useHighlighted(account);
  const kindOf = (id: string | null) => groupOf(id)?.kind;
  const nameOf = (id: string | null) => (id === null ? 'bozza' : groupOf(id)?.name);

  if (!ws.loaded) return <p className="muted">Carico l'agenda…</p>;
  return (
    <section aria-labelledby="agenda-h" className="stack">
      <h2 id="agenda-h" className="sr-only">Agenda</h2>
      {highlighted.length > 0 && (
        <AttentionList label="In evidenza" rows={highlighted.map(a => ({ activity: a, groupId: a.groupId }))}
          kindOf={kindOf} nameOf={nameOf} onOpen={onOpen} quick={quick} />
      )}
      {attention.overdue.length > 0 && (
        <AttentionList label="Scadute" rows={attention.overdue.map(o => ({ activity: o.activity, groupId: o.groupId, note: `scaduta ${onDay(o.since)}` }))}
          kindOf={id => groupOf(id)?.kind} nameOf={id => groupOf(id)?.name} onOpen={onOpen} quick={quick} />
      )}
      {attention.proposed.length > 0 && (
        <AttentionList label="Proposte a te" rows={attention.proposed.map(p => ({ ...p, note: `da ${shortName(p.activity.props.assignment!.assignedBy)}` }))}
          kindOf={id => groupOf(id)?.kind} nameOf={id => groupOf(id)?.name} onOpen={onOpen} quick={quick} />
      )}
      {Object.keys(agenda.days).length === 0 && <p className="muted">Niente in agenda {shown === MORE_DAYS ? 'nelle prossime due settimane' : `fino ${untilDay(addDays(from, shown - 1))}`}. Premi + per catturare un'idea.</p>}
      {Object.entries(agenda.days).map(([day, items]) => {
        const p = dayParts(day);
        return (
          <div key={day} className={`day${day === today() ? ' today' : ''}`}>
            <div className="d">{p.weekday}<b>{p.day}</b>{p.month}</div>
            <ul className="items">
              {items.map(it => <li key={`${it.activityId}|${it.start}`}><SwipeRow {...quick(it.activityId, it.start)}><Item it={it} today={day === today()} kind={groupOf(it.groupId)?.kind ?? 'personal'} group={groupOf(it.groupId)?.name ?? ''} me={account} onOpen={onOpen}
                high={ws.activities.find(a => a.id === it.activityId)?.props.priority === 'high'} /></SwipeRow></li>)}
            </ul>
          </div>
        );
      })}
      <button type="button" className="btn more-days" onClick={() => setShown(n => n + MORE_DAYS)}>Mostra altre due settimane</button>
      <h2 id="waiting-h">In attesa</h2>
      {agenda.waiting.length === 0 ? <p className="muted">Nessun memo in attesa.</p> : (
        <ul className="items" aria-labelledby="waiting-h">
          {agenda.waiting.map(a => (
            <li key={a.id}>
              <SwipeRow {...quick(a.id)}>
                <button className="item" style={{ '--grp': KIND_COLOR[groupOf(a.groupId!)?.kind ?? 'personal'] } as React.CSSProperties} onClick={() => onOpen({ activityId: a.id })}>
                  <span className="bar" /><span><span className="t">{a.title}</span><br /><span className="meta">aspetta: {a.props.waitingFor?.condition}</span></span>
                  <span className="time">{groupOf(a.groupId!)?.name}</span>
                </button>
              </SwipeRow>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Whether the occurrence still has to be taken, at a glance: the bottom third of the bar on the left, the top two
 * thirds keeping the group's colour. Not in the personal group, where nobody else can take it, nor once it is done.
 */
function takeOf(it: AgendaItem, kind: GroupKind, me: string): 'free' | 'mine' | 'other' | undefined {
  if (kind === 'personal' || struck(it)) return undefined;
  return !it.assignee ? 'free' : it.assignee === me ? 'mine' : 'other';
}

/** Done, skipped, or the day a moved occurrence left: struck through, still on its day (user's choice, 2026-11-16). */
const struck = (it: AgendaItem): boolean => it.done === true || it.skipped === true || it.movedTo !== undefined;

/** A high priority beside the title; normal and low say nothing, so the agenda stays quiet. */
const High = () => <span className="pill high">alta</span>;

/**
 * The rows switched by their arrow, by activity and start, for as long as the app stays open (user's choice,
 * 2026-11-16); at the next opening every row is again reduced, «Sempre espansa» aside.
 */
const folds = new Map<string, boolean>();
export const clearFolds = (): void => folds.clear();
const foldKey = (it: AgendaItem) => `${it.activityId}|${it.start}`;

function Item({ it, today: isToday, kind, group, me, high, onOpen }: { it: AgendaItem; today: boolean; kind: GroupKind; group: string; me: string; high: boolean; onOpen(t: OpenTarget): void }) {
  useBarPrefs();
  const [, redraw] = useState(0);
  const who = it.assignee ? (it.assignee === me ? 'tu' : shortName(it.assignee)) : 'libera';
  // Reduced: one lower line, the title on the left and the time on the right; every row at first (user's choice,
  // 2026-11-16), but those the person keeps «Sempre espansa» and today's still to do (user's choice, 2026-11-17).
  const small = folds.get(foldKey(it)) ?? !(isExpanded(me, it.activityId) || (isToday && !struck(it)));
  const toggle = () => { folds.set(foldKey(it), !small); redraw(n => n + 1); };
  return (
    <div className="item-row">
    {/* The row's own start opens it: a moved occurrence has two rows with one key. */}
    <button className={`item${struck(it) ? ' done' : ''}${small ? ' reduced' : ''}`} style={{ '--grp': KIND_COLOR[kind] } as React.CSSProperties}
      data-take={takeOf(it, kind, me)} onClick={() => onOpen({ activityId: it.activityId, occurrenceKey: it.start })}>
      <span className="bar" />
      {small ? <span className="t">{it.title}</span> : <span>
        <span className="t">{it.title}</span>{high && <High />}<br />
        {/* In the personal group «libera» would say nothing: everything there is the person's own. */}
        <span className="meta">{kind === 'personal' ? group : `${group} · ${who}`}</span>
        {it.coveredFor && <span className="pill cover">copre {shortName(it.coveredFor)}</span>}
        {it.done && <span className="pill ok">fatta</span>}
        {it.skipped && <span className="pill">saltata</span>}
        {movedNote(it) && <span className="pill">{movedNote(it)}</span>}
      </span>}
    </button>
    {/* The time and the arrow are one button (user's choice, 2026-11-16): a tap on the time expands or reduces too. */}
    <button type="button" className="fold" aria-label={`${small ? 'Espandi' : 'Riduci'} ${it.title}`} aria-expanded={!small} onClick={toggle}>
      <span className={it.start.length > 10 ? 'time' : 'time allday'}>{it.start.length > 10 ? `${it.start.slice(11)}${it.end ? `–${it.end.slice(11)}` : ''}` : 'giorno'}</span>
      <Icon name="chevron" size={16} />
    </button>
    </div>
  );
}

/** «al 13 dic», «all'8 dic». */
const untilDay = (day: LocalDate) => { const p = dayParts(day); return `${p.day === 8 || p.day === 11 ? "all'" : 'al '}${p.day} ${p.month}`; };
/** "il 6 nov", but "l'8 nov" and "l'11 nov": the article follows the sound of the number. */
const onDay = (day: LocalDate) => { const p = dayParts(day); return `${p.day === 8 || p.day === 11 ? "l'" : 'il '}${p.day} ${p.month}`; };

/**
 * The open activities the person keeps «In evidenza», in their order. A done or archived one leaves by itself, so the
 * section never fills up with closed things; a repeating one stays open, and stays, until the person takes it away.
 */
function useHighlighted(account: string): Activity[] {
  const ws = useWs();
  useBarPrefs();
  const all = [...ws.activities, ...ws.drafts];
  const kept = highlightsOf(account).map(id => all.find(a => a.id === id)).filter((a): a is Activity => a !== undefined);
  const closed = kept.filter(a => a.status !== 'open').map(a => a.id).join('|');
  useEffect(() => {
    if (closed) setHighlights(account, highlightsOf(account).filter(id => !closed.split('|').includes(id)));
  }, [account, closed]);
  return kept.filter(a => a.status === 'open');
}

interface AttentionRow { activity: Activity; groupId: string | null; note?: string }

/** A titled card of rows for what waits for the account (in view, overdue, proposals), above the days. */
function AttentionList({ label, rows, kindOf, nameOf, onOpen, quick }: {
  label: string; rows: AttentionRow[]; kindOf(id: string | null): GroupKind | undefined; nameOf(id: string | null): string | undefined; onOpen(t: OpenTarget): void;
  quick: ReturnType<typeof useQuickActions>;
}) {
  return (
    <div className="attention">
      <h3>{label}</h3>
      <ul className="items" aria-label={label}>
        {rows.map(r => (
          <li key={r.activity.id}>
            <SwipeRow {...quick(r.activity.id)}>
              <button className="item" style={{ '--grp': KIND_COLOR[kindOf(r.groupId) ?? 'personal'] } as React.CSSProperties} onClick={() => onOpen({ activityId: r.activity.id })}>
                <span className="bar" /><span><span className="t">{r.activity.title}</span>{r.activity.props.priority === 'high' && <High />}<br /><span className="meta">{[r.note, nameOf(r.groupId)].filter(Boolean).join(' · ')}</span></span>
                <span className="time" />
              </button>
            </SwipeRow>
          </li>
        ))}
      </ul>
    </div>
  );
}
