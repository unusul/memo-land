import { useState } from 'react';
import type { Activity } from '@attivita/core';
import { MAX_ACTIVITY_ALERTS, alertListOf, alertsOf, setActivityAlert, useBarPrefs } from '../groups/barPrefs.js';
import type { AlertAt } from '../groups/barPrefs.js';
import { useSession } from '../session/SessionContext.js';
import { useBackLayer } from '../shell/back.js';
import { Icon } from '../shell/icons.js';
import { PanelBackdrop, PanelHead, useEscape } from '../shell/PanelActions.js';
import { MenuSelect } from '../shell/PopMenu.js';
import { DAY_HOUR, NO_GENERAL, alertWords } from '../telegram/alerts.js';
import { usePushOn } from '../telegram/push.js';
import { telegramOn, useTelegramStatus } from '../telegram/state.js';
import type { TelegramStatus } from '../telegram/store.js';

type Unit = 'min' | 'h' | 'd';
/** At the start, some time before it, at the end, some time before it: the four kinds of an alert. */
type Kind = 'start' | 'beforeStart' | 'end' | 'beforeEnd';
const MINUTES: Record<Unit, number> = { min: 1, h: 60, d: 1440 };
const UNITS: ReadonlyArray<readonly [Unit, string]> = [['min', 'minuti'], ['h', 'ore'], ['d', 'giorni']];
const KINDS: ReadonlyArray<readonly [Kind, string]> = [['start', "all'inizio"], ['beforeStart', "prima dell'inizio"], ['end', 'alla fine'], ['beforeEnd', 'prima della fine']];

/** The hours of a `day` alert, every half hour from 6:00 to 23:30 (user's choice, 2026-11-19). */
const HALF_HOURS: ReadonlyArray<readonly [string, string]> = Array.from({ length: 36 }, (_, i) => {
  const t = `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return [t, t.replace(/^0/, '')] as const;
});
const DAY_KINDS: ReadonlyArray<readonly ['same' | 'before', string]> = [['same', 'il giorno stesso'], ['before', 'giorni prima']];

const shortBefore = (m: number) => (m % 1440 === 0 ? `${m / 1440} g` : m % 60 === 0 ? `${m / 60} h` : `${m} min`);
const RANK = { day: 0, start: 1, end: 2 } as const;
/** The days first, then the start and the end; the earliest first. */
const order = (x: AlertAt, y: AlertAt) => RANK[x.of] - RANK[y.of] || y.before - x.before || (x.at ?? '').localeCompare(y.at ?? '');
const same = (x: AlertAt, y: AlertAt) => x.of === y.of && x.before === y.before && (x.at ?? '') === (y.at ?? '');

/** What the bell's hint says is set (user's choice, 2026-11-18): «inizio −20 min, fine −15 min», «nessuno». */
export function alertSummary(list: AlertAt[]): string {
  if (list.length === 0) return 'nessuno';
  return list.map(x => (x.of === 'day'
    ? `${x.before ? `−${x.before} g` : 'giorno'} ${(x.at ?? DAY_HOUR).replace(/^0/, '')}`
    : `${x.of === 'start' ? 'inizio' : 'fine'}${x.before ? ` −${shortBefore(x.before)}` : ''}`)).join(', ');
}

/**
 * Why the bell cannot set alerts here, or null when it can (user's request, 2026-11-19): the bell is on every activity,
 * and its panel says the reason instead of the bell missing without a word. Since the push (2026-11-19) a channel on
 * is enough: Telegram, or the notifications of this device (`device`).
 */
export function alertBlock(hasStore: boolean, status: TelegramStatus | null | undefined, dated: boolean, device = false): string | null {
  if (!hasStore) return 'Gli avvisi non sono disponibili con questo accesso.';
  if (!device) {
    if (status === undefined) return 'Controllo i canali degli avvisi…';
    if (status === null) return 'Il server non risponde ora: riprova tra poco.';
    if (!telegramOn(status)) return 'Nessun canale acceso: collega Telegram o accendi le notifiche in Impostazioni → Avvisi.';
  }
  if (!dated) return 'Questa attività non ha una data: aggiungi una scadenza o Data e ora.';
  return null;
}

/**
 * The bell, on every activity (user's choices, 2026-11-18/19): a panel with the activity's alerts, up to five,
 * or the reason they cannot be set. The person's only, as «In evidenza»; lit when it has alerts. Alerts are only those
 * set here (2026-11-19): «Come in Impostazioni / Scelti qui / Nessuno» went with the switches of Impostazioni. Before,
 * the bell showed only on an activity with a time and with Telegram's server. The panel is opened by the bell or by the
 * detail's «Avvisi» row (2026-11-19): `open` and `setOpen` come from the detail, so the two open the same panel.
 */
export function AlertButton({ activity: a, me, open, setOpen }: { activity: Activity; me: string; open: boolean; setOpen(open: boolean): void }) {
  const { telegram } = useSession();
  const status = useTelegramStatus();
  const device = usePushOn();
  useBarPrefs();
  useBackLayer(open, () => setOpen(false));
  useEscape(open, () => setOpen(false));
  const when = a.props.schedule?.start ?? a.props.due;
  const blocked = alertBlock(telegram !== undefined, status, when !== undefined, device === true);
  // A date without an hour: alerts on its day, at an hour chosen (2026-11-19).
  const dateOnly = (when?.length ?? 0) <= 10;
  const list = alertListOf(alertsOf(me)[a.id], NO_GENERAL) ?? [];
  const save = (next: AlertAt[]) => setActivityAlert(me, a.id, next.length > 0 ? { mode: 'here', list: [...next].sort(order) } : undefined);
  return (
    <span className="attach">
      <button type="button" className={`icon-choice small${list.length > 0 ? ' on' : ''}`} aria-label="Avvisi" aria-expanded={open}
        title={`Avvisi: ${alertSummary(list)}`} onClick={() => setOpen(true)}>
        <Icon name="bell" size={18} />
      </button>
      {open && <>
        <PanelBackdrop />
        <div className="menu panel alert-panel" role="dialog" aria-label="Avvisi">
          <PanelHead title="Avvisi" onCancel={() => setOpen(false)} />
          {blocked ? <p className="alert-none"><Icon name="bellOff" size={18} /> {blocked}</p> : <>
          <AlertList list={list} onRemove={i => save(list.filter((_, k) => k !== i))} />
          {list.length < MAX_ACTIVITY_ALERTS && (dateOnly
            ? <AddDayAlert onAdd={x => { if (!list.some(y => same(x, y))) save([...list, x]); }} />
            : <AddAlert hasEnd={a.props.schedule?.end !== undefined} onAdd={x => { if (!list.some(y => same(x, y))) save([...list, x]); }} />)}
          </>}
        </div>
      </>}
    </span>
  );
}

/**
 * The detail's «Avvisi» row, under the properties (user's request, 2026-11-19): the alerts set in words, «15 minuti
 * prima dell'inizio, alla fine», or «Imposta»; a tap opens the bell's panel, which also says why alerts cannot be set
 * here. Only on an activity with a date: without one no alert can go off. On 2026-11-18 a row among the properties had
 * been set aside for the bell alone; the bell stays.
 */
export function AlertRow({ activity: a, me, onOpen }: { activity: Activity; me: string; onOpen(): void }) {
  useBarPrefs();
  if ((a.props.schedule?.start ?? a.props.due) === undefined) return null;
  const list = alertListOf(alertsOf(me)[a.id], NO_GENERAL) ?? [];
  return (
    <>
      <dt>Avvisi</dt>
      <dd><button type="button" className="link value" aria-label="Modifica Avvisi" onClick={onOpen}>
        {list.length > 0 ? list.map(alertWords).join(', ') : 'Imposta'}
      </button></dd>
    </>
  );
}

/**
 * The alerts set, in words, «15 minuti prima dell'inizio», each with its × (user's choice, 2026-11-19): before, rows of
 * fields, one per alert, that on a computer fell apart into three lines. Each change is kept at once.
 */
function AlertList({ list, onRemove }: { list: AlertAt[]; onRemove(i: number): void }) {
  if (list.length === 0) return <p className="alert-none"><Icon name="bellOff" size={18} /> Nessun avviso</p>;
  return (
    <ul className="alert-list">
      {list.map((x, i) => (
        <li key={`${x.of}${x.before}`}>
          <Icon name="bell" size={18} />
          <span>{alertWords(x)}</span>
          <button type="button" className="link" aria-label={`Togli ${alertWords(x)}`} title="Togli" onClick={() => onRemove(i)}><Icon name="trash" size={16} /></button>
        </li>
      ))}
    </ul>
  );
}

/**
 * One more alert: «all'inizio», «prima dell'inizio», «alla fine», «prima della fine» (user's choice, 2026-11-19: no
 * «0 minuti all'ora esatta»); how long before only for the two «prima». Without an end, no alerts on the end.
 */
function AddAlert({ hasEnd, onAdd }: { hasEnd: boolean; onAdd(x: AlertAt): void }) {
  const [kind, setKind] = useState<Kind>('start');
  const [n, setN] = useState('10');
  const [unit, setUnit] = useState<Unit>('min');
  const ahead = kind === 'beforeStart' || kind === 'beforeEnd';
  const valid = !ahead || /^[1-9]\d{0,2}$/.test(n);
  const kinds = hasEnd ? KINDS : KINDS.filter(([k]) => k === 'start' || k === 'beforeStart');
  const add = () => onAdd({ of: kind === 'start' || kind === 'beforeStart' ? 'start' : 'end', before: ahead ? Number(n) * MINUTES[unit] : 0 });
  return (
    <div className="alert-add" role="group" aria-label="Aggiungi un avviso">
      <MenuSelect<Kind> label="Quando" value={kind} options={kinds} onChange={setKind} />
      {ahead && <>
        <input type="text" inputMode="numeric" className="alert-n" aria-label="Quanto prima" value={n}
          onChange={e => setN(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <MenuSelect<Unit> label="Unità" value={unit} options={UNITS} onChange={setUnit} />
      </>}
      <button type="button" className="btn alert-plus" disabled={!valid} onClick={add}><Icon name="plus" size={16} /> Aggiungi</button>
    </div>
  );
}

/**
 * One more alert for a date without an hour (user's choice, 2026-11-19): «il giorno stesso» or some «giorni prima», at an
 * hour of a menu every half hour. Before, the bell could not be used there: «Questa attività non ha un'ora».
 */
function AddDayAlert({ onAdd }: { onAdd(x: AlertAt): void }) {
  const [kind, setKind] = useState<'same' | 'before'>('same');
  const [n, setN] = useState('1');
  const [at, setAt] = useState(DAY_HOUR);
  // The hours open right under their button, as wide as it, a short list that scrolls inside and pushes the panel down
  // (user's choices, 2026-11-19): a menu of 36 over the page overflowed the panel, which then scrolled; a grid of 36
  // buttons was «bruttino»; a list as wide as the panel, «così grande».
  const [picking, setPicking] = useState(false);
  const valid = kind === 'same' || /^[1-9]\d?$/.test(n);
  return (
    <div className="alert-add" role="group" aria-label="Aggiungi un avviso">
      <MenuSelect<'same' | 'before'> label="Quando" value={kind} options={DAY_KINDS} onChange={setKind} />
      {kind === 'before' && <input type="text" inputMode="numeric" className="alert-n" aria-label="Quanti giorni prima" value={n}
        onChange={e => setN(e.target.value.replace(/\D/g, '').slice(0, 2))} />}
      <span className="small">alle</span>
      <span className="hour-pick">
        <button type="button" className="btn select" aria-label="Ora" aria-expanded={picking} onClick={() => setPicking(p => !p)}>{at.replace(/^0/, '')} ▾</button>
        {picking && (
          <span className="hour-list" role="listbox" aria-label="Ore"
            ref={el => el?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'center' })}>
            {HALF_HOURS.map(([v, t]) => <button key={v} type="button" role="option" aria-selected={v === at} onClick={() => { setAt(v); setPicking(false); }}>{t}</button>)}
          </span>
        )}
      </span>
      <button type="button" className="btn alert-plus" disabled={!valid}
        onClick={() => onAdd({ of: 'day', before: kind === 'same' ? 0 : Number(n), at })}><Icon name="plus" size={16} /> Aggiungi</button>
    </div>
  );
}
