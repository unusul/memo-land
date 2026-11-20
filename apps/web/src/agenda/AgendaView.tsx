import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { alertGoesTo, alertListOf, buildAgenda, can, needsAttention, outOfCalendar } from '@attivita/core';
import { nextTime, shortDay } from './when.js';
import { RepeatHere, daysOf } from './RepeatHere.js';
import { copyToDay } from './copyToDay.js';
import { alertsOf, highlightsOf, rowSizeOf, setHighlights, useBarPrefs } from '../groups/barPrefs.js';
import { NO_GENERAL } from '../telegram/alerts.js';
import { setAgendaMode, setShownMonth, useAgendaMode, useShownMonth } from './agendaMode.js';
import type { Activity, AgendaItem, Group, GroupKind, LocalDate } from '@attivita/core';
import { addDays, dayParts, instantNow, today } from '../dates.js';
import { errorText } from '../labels.js';
import { useToast } from '../shell/toast.js';
import { shortName, youName } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { useAgendaSources } from './sources.js';
import { useQuickActions } from './quickActions.js';
import { SwipeRow } from '../shell/SwipeRow.js';
import { movedNote } from '../activity/occurrence.js';
import { Icon } from '../shell/icons.js';
import { useBackLayer } from '../shell/back.js';
import { MonthView, dayLabel, monthDays } from './MonthView.js';

export const KIND_COLOR: Record<GroupKind, string> = { domain: 'var(--acc-dom)', invite: 'var(--acc-inv)', personal: 'var(--acc-per)' };

export interface OpenTarget {
  activityId: string;
  occurrenceKey?: string | undefined;
  /** A form to open ready: the date, after the swipe «Sposta la data». */
  form?: 'due' | 'schedule';
}

/** How long the line after a copy stays over the month. */
const NOTICE_MS = 4000;

/** What «Mostra altre due settimane» adds at each tap (user's choice, 2026-11-16). */
const MORE_DAYS = 14;

export function AgendaView({ from = today(), days = 14, onOpen, onAddOn }: {
  from?: LocalDate; days?: number; onOpen(t: OpenTarget): void;
  /**
   * «+ Aggiungi» on a day of the month: a new activity that day. It said «Aggiungi il 18 novembre» until 2026-11-18;
   * the day is already the panel's title (user's choice).
   */
  onAddOn?(day: LocalDate): void;
}) {
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
  // The list or the month, chosen with «Agenda | Calendario» in the header (user's choice, 2026-11-17); the month opens
  // on the one of `from`. It is a step inside the Agenda: the phone's back goes from it to the list.
  const mode = useAgendaMode();
  useBackLayer(mode === 'month', () => setAgendaMode('list'));
  const month = useShownMonth() || from.slice(0, 7);
  const [openDay, setOpenDay] = useState<LocalDate | null>(null);
  const [, redrawDays] = useState(0);
  // «Copia su un altro giorno» (user's choices, 2026-11-17): the activity waiting for the day a tap on the month gives
  // it, one day at a time, and then a line saying what was done for a few seconds. The phone's back gives up the copy.
  const [copying, setCopying] = useState<{ id: string; title: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useBackLayer(copying !== null, () => setCopying(null));
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  const toast = useToast();
  const grid = monthDays(month);
  // The Calendar leaves out the informations and what is switched off there (user's choices, 2026-11-17).
  const inCalendar = sources.map(s => ({ ...s, activities: s.activities.filter(a => !outOfCalendar(a)) }));
  const monthAgenda = mode === 'month' ? buildAgenda(inCalendar, `${grid[0]!}T00:00`, `${grid.at(-1)!}T23:59`) : null;
  const infoIds = new Set(ws.activities.filter(a => a.info).map(a => a.id));
  const meIn = (groupId: string) => ws.engineOf(groupId)?.account ?? account;
  /** Only who edits the activity's group copies it; it needs a day to copy from. */
  const copyable = (id: string) => {
    const a = ws.activities.find(x => x.id === id);
    const group = a?.groupId ? groupOf(a.groupId) : undefined;
    return a !== undefined && group !== undefined && !group.archived && a.status === 'open' && can(group, meIn(group.id), 'editActivity') && daysOf(a).length > 0;
  };
  // `copy`: the rows of a day of the Calendar, the only ones with «Copia su un altro giorno».
  const rows = (day: LocalDate, items: AgendaItem[], copy = false) => items.map(it => (
    <li key={`${it.activityId}|${it.start}`}><SwipeRow {...quick(it.activityId, it.start)}><Item it={it} shared={sharedGroup(groupOf(it.groupId))} info={infoIds.has(it.activityId)} kind={groupOf(it.groupId)?.kind ?? 'personal'} group={groupOf(it.groupId)?.name ?? ''} me={account} onOpen={onOpen}
      high={ws.activities.find(a => a.id === it.activityId)?.props.priority === 'high'}
      onCopy={copy && copyable(it.activityId) ? () => { setOpenDay(null); setNotice(null); setCopying({ id: it.activityId, title: it.title }); } : undefined} /></SwipeRow></li>
  ));
  /** The day tapped while copying: added to the same activity, or a new one for a series by a rule; then the month again. */
  async function copyOn(day: LocalDate) {
    const a = ws.activities.find(x => x.id === copying?.id);
    setCopying(null);
    if (!a) return;
    const result = copyToDay(a, day, meIn(a.groupId!), instantNow());
    if (result.kind === 'there') { setNotice(`C'è già ${onDay(day)}`); return; }
    try {
      await ws.save(result.activity);
      setNotice(result.kind === 'added' ? `Aggiunta ${onDay(day)}` : `Copia creata ${onDay(day)}`);
    } catch (e) {
      toast({ text: errorText(e) });
    }
  }

  if (!ws.loaded) return <p className="muted">Carico l'agenda…</p>;
  return (
    <section aria-labelledby="agenda-h" className="stack">
      <h2 id="agenda-h" className="sr-only">Agenda</h2>
      {/* In evidenza, Scadute and Proposte a te belong to the list: the Calendar shows only the month (user's choices,
          2026-11-17). */}
      {highlighted.length > 0 && mode === 'list' && (
        <AttentionList label="In evidenza" rows={highlighted.map(a => ({ activity: a, groupId: a.groupId, when: nextTime(a) }))}
          kindOf={kindOf} nameOf={nameOf} me={account} onOpen={onOpen} quick={quick} />
      )}
      {attention.overdue.length > 0 && mode === 'list' && (
        <AttentionList label="Scadute" rows={attention.overdue.map(o => ({ activity: o.activity, groupId: o.groupId, note: `scaduta ${onDay(o.since)}`, when: shortDay(o.since) }))}
          kindOf={id => groupOf(id)?.kind} nameOf={id => groupOf(id)?.name} me={account} onOpen={onOpen} quick={quick} />
      )}
      {attention.proposed.length > 0 && mode === 'list' && (
        <AttentionList label="Proposte a te" rows={attention.proposed.map(p => ({ ...p, note: `da ${shortName(p.activity.props.assignment!.assignedBy)}`, when: nextTime(p.activity) }))}
          kindOf={id => groupOf(id)?.kind} nameOf={id => groupOf(id)?.name} me={account} onOpen={onOpen} quick={quick} />
      )}
      {monthAgenda && copying && (
        <div className="copy-band" role="status">
          <span>Tocca il giorno per «{copying.title}»</span>
          <button type="button" className="link" onClick={() => setCopying(null)}>Annulla</button>
        </div>
      )}
      {monthAgenda && !copying && notice && <div className="copy-band" role="status"><span>{notice}</span></div>}
      {monthAgenda && (
        <MonthView month={month} setMonth={setShownMonth} days={monthAgenda.days} onDay={day => (copying ? void copyOn(day) : setOpenDay(day))} struck={struck}
          kindOf={it => KIND_COLOR[groupOf(it.groupId)?.kind ?? 'personal']} />
      )}
      {monthAgenda && openDay && (
        <DaySheet day={openDay} onClose={() => setOpenDay(null)}>
          {(monthAgenda.days[openDay] ?? []).length === 0 ? <p className="muted">Niente in questo giorno.</p>
            : <ul className="items">{rows(openDay, monthAgenda.days[openDay]!, true)}</ul>}
          <div className="btns">
            {onAddOn && <button type="button" className="btn" onClick={() => onAddOn(openDay)}><Icon name="plus" size={18} /> Aggiungi</button>}
            <RepeatHere key={openDay} day={openDay} />
          </div>
        </DaySheet>
      )}
      {!monthAgenda && <>
      {Object.keys(agenda.days).length === 0 && <p className="muted">Niente in agenda {shown === MORE_DAYS ? 'nelle prossime due settimane' : `fino ${untilDay(addDays(from, shown - 1))}`}. Premi + per catturare un'idea.</p>}
      {Object.entries(agenda.days).map(([day, items]) => {
        const p = dayParts(day);
        const closed = closedDays.has(day);
        const toggleDay = () => { if (closed) closedDays.delete(day); else closedDays.add(day); redrawDays(n => n + 1); };
        return (
          <div key={day} className={`day${day === today() ? ' today' : ''}`}>
            <button type="button" className="d" aria-label={`${closed ? 'Espandi' : 'Riduci'} ${dayLabel(day).toLowerCase()}`} aria-expanded={!closed} onClick={toggleDay}>
              {p.weekday}<b>{p.day}</b>{p.month}
            </button>
            {closed ? <button type="button" className="day-count" onClick={toggleDay}>{items.length} attività</button> : (
              <ul className="items">
                {rows(day, items)}
              </ul>
            )}
          </div>
        );
      })}
      <button type="button" className="btn more-days" onClick={() => setShown(n => n + MORE_DAYS)}>Mostra altre due settimane</button>
      </>}
      {/* In attesa belongs to the list, not to the month (user's choice, 2026-11-17), as In evidenza. */}
      {!monthAgenda && <>
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
      </>}
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
/** A group of two or more: there, who takes what is worth seeing at once (user's choice, 2026-11-17). */
const sharedGroup = (g: Group | undefined): boolean => g !== undefined && g.kind !== 'personal' && Object.keys(g.members).length > 1;

/** An information (2026-11-17): to know, not to do. */
const Info = () => <span className="pill info">info</span>;

/**
 * Whether a time of the agenda has alerts for the person (user's request, 2026-11-20): alerts set with the bell, that
 * «Per chi» lets through for this time, as the server reads them; not on a time done, skipped or moved away, which the
 * server does not alert. A time of today already gone keeps it: a bell that went off while looking would be a jump.
 */
export function rowAlerted(it: AgendaItem, me: string): boolean {
  if (it.done || it.skipped || it.movedTo) return false;
  const set = alertsOf(me)[it.activityId];
  return (alertListOf(set, NO_GENERAL) ?? []).length > 0 && alertGoesTo(set?.who, it.assignee, me);
}

/** The bell after the title, small and grey (user's choice, 2026-11-20). */
const Bell = () => <span className="row-bell" role="img" aria-label="Con avvisi" title="Con avvisi"><Icon name="bell" size={14} /></span>;

/**
 * The rows switched by their arrow, by activity and start, for as long as the app stays open (user's choice,
 * 2026-11-16); at the next opening every row is again reduced, «Sempre espansa» aside.
 */
const folds = new Map<string, boolean>();
/**
 * The days reduced by a tap on their date (user's choices, 2026-11-19): one grey line, «3 attività», in place of the
 * rows; the rows keep their own state, so they come back as they were. For as long as the app stays open, as the rows.
 */
const closedDays = new Set<LocalDate>();
export const clearFolds = (): void => { folds.clear(); closedDays.clear(); };
const foldKey = (it: AgendaItem) => `${it.activityId}|${it.start}`;

function Item({ it, shared, info, kind, group, me, high, onOpen, onCopy }: { it: AgendaItem; shared: boolean; info: boolean; kind: GroupKind; group: string; me: string; high: boolean; onOpen(t: OpenTarget): void; onCopy?: (() => void) | undefined }) {
  useBarPrefs();
  const [, redraw] = useState(0);
  const who = it.assignee ? (it.assignee === me ? youName(me) : shortName(it.assignee)) : 'libera';
  // Reduced: one lower line, the title on the left and the time on the right. In a group of two or more a row still to
  // do starts in full, so whether it is free or whose it is shows at once, on every day; in Personale, once done, and
  // for an information it starts reduced (user's choices, 2026-11-17; before: every row reduced, then today's in full).
  // «Sempre espansa» and «Sempre ridotta» set how it starts; the arrow switches any row.
  const size = rowSizeOf(me, it.activityId);
  const small = folds.get(foldKey(it)) ?? (size === 'auto' ? !(shared && !struck(it) && !info) : size === 'reduced');
  const toggle = () => { folds.set(foldKey(it), !small); redraw(n => n + 1); };
  const bell = rowAlerted(it, me);
  return (
    <div className="item-row">
    {/* The row's own start opens it: a moved occurrence has two rows with one key. */}
    <button className={`item${struck(it) ? ' done' : ''}${small ? ' reduced' : ''}${info ? ' info' : ''}`} style={{ '--grp': info ? 'var(--muted)' : KIND_COLOR[kind] } as React.CSSProperties}
      data-take={info ? undefined : takeOf(it, kind, me)} onClick={() => onOpen({ activityId: it.activityId, occurrenceKey: it.start })}>
      <span className="bar" />
      {small ? <span className="t">{it.title}{info && <Info />}{bell && <Bell />}</span> : <span>
        <span className="t">{it.title}</span>{info && <Info />}{high && <High />}{bell && <Bell />}<br />
        {/* In the personal group «libera» would say nothing: everything there is the person's own. */}
        {/* Who covers for whom reads in the row's grey, after the names (user's choice, 2026-11-18): an orange pill was too much. */}
        <span className="meta">{kind === 'personal' ? group : `${group} · ${who}`}{it.coveredFor && ` · copre ${shortName(it.coveredFor)}`}</span>
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
    {onCopy && <button type="button" className="icon-choice small copy-day" aria-label={`Copia ${it.title} su un altro giorno`} title="Copia su un altro giorno" onClick={onCopy}><Icon name="copy" size={18} /></button>}
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

/**
 * A day of the month, opened by a tap on it (user's choice, 2026-11-17): its rows as in the list, over the page. Chiudi,
 * a tap outside, Esc or the phone's back button close it. On the page's body, not in the Agenda: the page's entrance
 * animation moves it, and a fixed sheet inside it would follow the page instead of the screen.
 */
function DaySheet({ day, onClose, children }: { day: LocalDate; onClose(): void; children: React.ReactNode }) {
  useBackLayer(true, onClose);
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close.current(); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={dayLabel(day)} className="sheet day-sheet" ref={box}
      onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div className="day-sheet-head"><h3>{dayLabel(day)}</h3><button type="button" className="link" onClick={onClose}>Chiudi</button></div>
      {children}
    </div>,
    document.body,
  );
}

interface AttentionRow { activity: Activity; groupId: string | null; note?: string; when?: string | undefined }

/** A titled card of rows for what waits for the account (in view, overdue, proposals), above the days. */
function AttentionList({ label, rows, kindOf, nameOf, me, onOpen, quick }: {
  label: string; rows: AttentionRow[]; kindOf(id: string | null): GroupKind | undefined; nameOf(id: string | null): string | undefined; me: string;
  onOpen(t: OpenTarget): void; quick: ReturnType<typeof useQuickActions>;
}) {
  return (
    <div className="attention">
      <h3>{label}</h3>
      <ul className="items" aria-label={label}>
        {rows.map(r => (
          <li key={r.activity.id}>
            <SwipeRow {...quick(r.activity.id)}>
              <AttentionItem row={r} section={label} kind={kindOf(r.groupId) ?? 'personal'} group={nameOf(r.groupId)} me={me} onOpen={onOpen} />
            </SwipeRow>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A row above the days, with the days' arrow (user's choice, 2026-11-17): in full at first, as before, since the line
 * under the title says why it is there; on one line when the person keeps the activity «Sempre ridotta». The arrow
 * switches it for as long as the app stays open. Before, these rows had no arrow and were always in full.
 */
function AttentionItem({ row, section, kind, group, me, onOpen }: { row: AttentionRow; section: string; kind: GroupKind; group: string | undefined; me: string; onOpen(t: OpenTarget): void }) {
  useBarPrefs();
  const [, redraw] = useState(0);
  const a = row.activity;
  const key = `${section}|${a.id}`;
  const small = folds.get(key) ?? rowSizeOf(me, a.id) === 'reduced';
  const toggle = () => { folds.set(key, !small); redraw(n => n + 1); };
  return (
    <div className="item-row">
      <button className={`item${small ? ' reduced' : ''}`} style={{ '--grp': KIND_COLOR[kind] } as React.CSSProperties} onClick={() => onOpen({ activityId: a.id })}>
        <span className="bar" />
        {small ? <span className="t">{a.title}</span>
          : <span><span className="t">{a.title}</span>{a.props.priority === 'high' && <High />}<br /><span className="meta">{[row.note, group].filter(Boolean).join(' · ')}</span></span>}
      </button>
      <button type="button" className="fold" aria-label={`${small ? 'Espandi' : 'Riduci'} ${a.title}`} aria-expanded={!small} onClick={toggle}>
        {row.when && <span className="time">{row.when}</span>}
        <Icon name="chevron" size={16} />
      </button>
    </div>
  );
}
