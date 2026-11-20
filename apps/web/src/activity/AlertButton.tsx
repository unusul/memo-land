import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Activity } from '@attivita/core';
import { MAX_ACTIVITY_ALERTS, alertListOf, alertsOf, setActivityAlert, useBarPrefs } from '../groups/barPrefs.js';
import type { AlertAt } from '../groups/barPrefs.js';
import type { AlertWho } from '@attivita/core';
import { useSession } from '../session/SessionContext.js';
import { useBackLayer } from '../shell/back.js';
import { Icon } from '../shell/icons.js';
import { PanelActions, PanelBackdrop, PanelHead, useEscape } from '../shell/PanelActions.js';
import { MenuChoice, MenuSelect, PopMenu } from '../shell/PopMenu.js';
import { DAY_HOUR, NO_GENERAL, alertWords } from '../telegram/alerts.js';
import { usePushOn } from '../telegram/push.js';
import { telegramOn, useTelegramStatus } from '../telegram/state.js';
import type { TelegramStatus } from '../telegram/store.js';

type Unit = 'min' | 'h' | 'd';
const MINUTES: Record<Unit, number> = { min: 1, h: 60, d: 1440 };
const UNITS: ReadonlyArray<readonly [Unit, string]> = [['min', 'minuti'], ['h', 'ore'], ['d', 'giorni']];

/** The hours of a `day` alert, every half hour from 6:00 to 23:30 (user's choice, 2026-11-19). */
const HALF_HOURS: ReadonlyArray<readonly [string, string]> = Array.from({ length: 36 }, (_, i) => {
  const t = `${String(6 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
  return [t, t.replace(/^0/, '')] as const;
});

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
export function alertBlock(hasStore: boolean, status: TelegramStatus | null | undefined, dated: boolean, device = false, draft = false): string | null {
  if (!hasStore) return 'Gli avvisi non sono disponibili con questo accesso.';
  // A draft is in no group, so the alerts (computed from the groups, on the server too) never reach it (user's choice,
  // 2026-11-19: no alerts on drafts, rather than computing them for drafts as well).
  if (draft) return 'Le bozze non hanno avvisi: spostala in un gruppo, anche Personale.';
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
  useBackLayer(open, () => close());
  useEscape(open, () => close());
  const when = a.props.schedule?.start ?? a.props.due;
  const blocked = alertBlock(telegram !== undefined, status, when !== undefined, device === true, a.groupId === null);
  // A date without an hour: alerts on its day, at an hour chosen (2026-11-19).
  const dateOnly = (when?.length ?? 0) <= 10;
  const saved = alertsOf(me)[a.id];
  const list = alertListOf(saved, NO_GENERAL) ?? [];
  // The changes wait in the panel and go all together with ✓ (user's request, 2026-11-19), as in the other panels with
  // fields; × , Esc and the phone's back drop them. Before, each Aggiungi and each × was kept at once. «Per chi» waits
  // with them (2026-11-20); with no alert left it is not kept.
  const [draft, setDraft] = useState<{ list: AlertAt[]; who: AlertWho } | null>(null);
  const shown = draft?.list ?? list;
  const who = draft?.who ?? saved?.who ?? 'all';
  const save = ({ list: next, who: w }: { list: AlertAt[]; who: AlertWho }) => setActivityAlert(me, a.id,
    next.length > 0 ? { mode: 'here', list: next, ...(w === 'all' ? {} : { who: w }) } : undefined);
  const change = (next: AlertAt[]) => setDraft({ list: [...next].sort(order), who });
  const choose = (w: AlertWho) => setDraft({ list: shown, who: w });
  const add = (x: AlertAt) => { if (!shown.some(y => same(x, y))) change([...shown, x]); };
  const close = () => { setDraft(null); setOpen(false); };
  const apply = (e: React.FormEvent) => { e.preventDefault(); if (draft) save(draft); close(); };
  return (
    <span className="attach">
      <button type="button" className={`icon-choice small${list.length > 0 ? ' on' : ''}`} aria-label="Avvisi" aria-expanded={open}
        title={`Avvisi: ${alertSummary(list)}`} onClick={() => setOpen(true)}>
        <Icon name="bell" size={18} />
      </button>
      {open && <>
        <PanelBackdrop />
        <form className="menu panel alert-panel" role="dialog" aria-label="Avvisi" onSubmit={apply}>
          <PanelHead title="Avvisi" onCancel={close} />
          {blocked ? <p className="alert-none"><Icon name="bellOff" size={18} /> {blocked}</p> : <>
          <WhoRow who={who} onChoose={choose} />
          <AlertList list={shown} onRemove={i => change(shown.filter((_, k) => k !== i))}>
            {dateOnly
              ? <AddDayRows full={shown.length >= MAX_ACTIVITY_ALERTS} onAdd={add} />
              : <AddRows hasEnd={a.props.schedule?.end !== undefined} taken={shown} full={shown.length >= MAX_ACTIVITY_ALERTS} onAdd={add} />}
          </AlertList>
          <PanelActions disabled={draft === null} onCancel={close} />
          </>}
        </form>
      </>}
    </span>
  );
}

/** The words of «Per chi» (user's choice, 2026-11-20). */
const WHO: ReadonlyArray<readonly [AlertWho, string]> = [['all', 'Sempre'], ['mineOrNobody', 'Mia o di nessuno'], ['mine', 'Solo mia']];

/**
 * «Per chi», on top of the bell's panel (user's choice, 2026-11-20): for whom its alerts go off, for all of them,
 * time by time; «Sempre» to start with, as the alerts set before it. Chips, as the quick dates, so they wrap on a phone.
 */
function WhoRow({ who, onChoose }: { who: AlertWho; onChoose(who: AlertWho): void }) {
  return (
    <div className="alert-who" role="group" aria-label="Per chi">
      <span>Per chi</span>
      <span className="alert-who-choices">
        {WHO.map(([v, t]) => <button key={v} type="button" className="chip" aria-pressed={who === v} onClick={() => onChoose(v)}>{t}</button>)}
      </span>
    </div>
  );
}

/** What the «Avvisi» row adds for «Per chi»: nothing for «Sempre». */
export const whoSuffix = (who: AlertWho | undefined): string => (who === 'mine' ? ' · solo mia' : who === 'mineOrNobody' ? ' · mia o di nessuno' : '');

/**
 * The detail's «Avvisi» row, under the properties (user's request, 2026-11-19): the alerts set in words, «15 minuti
 * prima dell'inizio, alla fine», or «Imposta»; a tap opens the bell's panel, which also says why alerts cannot be set
 * here. Only on an activity with a date: without one no alert can go off. On 2026-11-18 a row among the properties had
 * been set aside for the bell alone; the bell stays.
 */
export function AlertRow({ activity: a, me, onOpen }: { activity: Activity; me: string; onOpen(): void }) {
  useBarPrefs();
  // Not on a draft either: it has no alerts (2026-11-19).
  if ((a.props.schedule?.start ?? a.props.due) === undefined || a.groupId === null) return null;
  const saved = alertsOf(me)[a.id];
  const list = alertListOf(saved, NO_GENERAL) ?? [];
  return (
    <>
      <dt>Avvisi</dt>
      <dd><button type="button" className="link value" aria-label="Modifica Avvisi" onClick={onOpen}>
        {list.length === 0 ? 'Imposta' : `${list.length <= 2 ? list.map(alertWords).join(', ') : `${list.length} avvisi`}${whoSuffix(saved?.who)}`}
      </button></dd>
    </>
  );
}

/**
 * The alerts set, in words, «15 minuti prima dell'inizio», each with its × (user's choice, 2026-11-19): before, rows of
 * fields, one per alert, that on a computer fell apart into three lines. Each change waits for ✓ (2026-11-19).
 */
function AlertList({ list, onRemove, children }: { list: AlertAt[]; onRemove(i: number): void; children: ReactNode }) {
  return (
    <ul className="alert-list">
      {list.length === 0 && <li className="alert-none"><Icon name="bellOff" size={18} /> Nessun avviso</li>}
      {list.map((x, i) => (
        <li key={`${x.of}${x.before}${x.at ?? ''}`}>
          <Icon name="bell" size={18} />
          <span>{alertWords(x)}</span>
          <button type="button" className="link" aria-label={`Togli ${alertWords(x)}`} title="Togli" onClick={() => onRemove(i)}><Icon name="trash" size={16} /></button>
        </li>
      ))}
      {children}
    </ul>
  );
}

/**
 * One open row per kind of alert, each with its + where the alerts have their bin (user's choice, 2026-11-19, «metti
 * tutto aperto»): «all'inizio», «… prima dell'inizio», «alla fine», «… prima della fine»; the end ones only with an end.
 * «all'inizio» and «alla fine» leave once in the list. Before, one dashed row with a «Quando» menu, the amount, the unit
 * and «+ Aggiungi»: its menu opened inside the panel, which grew a scroll bar.
 */
function AddRows({ hasEnd, taken, full, onAdd }: { hasEnd: boolean; taken: AlertAt[]; full: boolean; onAdd(x: AlertAt): void }) {
  const has = (of: 'start' | 'end') => taken.some(x => x.of === of && x.before === 0);
  return (
    <>
      {!has('start') && <AtRow words="all'inizio" full={full} onAdd={() => onAdd({ of: 'start', before: 0 })} />}
      <BeforeRow of="start" full={full} onAdd={onAdd} />
      {hasEnd && !has('end') && <AtRow words="alla fine" full={full} onAdd={() => onAdd({ of: 'end', before: 0 })} />}
      {hasEnd && <BeforeRow of="end" full={full} onAdd={onAdd} />}
    </>
  );
}

/** The hour a new day alert starts at (user's choice, 2026-11-20; before, 9:00). */
const NEW_DAY_HOUR = '10:00';

/**
 * The + of an add row, where an alert has its bin; off once the five are set. A row changed and not added is marked
 * (user's request, 2026-11-20), as ✓ keeps only what the + put in the list; after its +, it goes back to how it started.
 */
function PlusButton({ words, disabled, full, onAdd }: { words: string; disabled?: boolean; full: boolean; onAdd(): void }) {
  return (
    <button type="button" className="link plus" aria-label={`Aggiungi ${words}`} title={full ? `Al massimo ${MAX_ACTIVITY_ALERTS} avvisi` : 'Aggiungi'}
      disabled={full || disabled} onClick={onAdd}><Icon name="plus" size={16} /></button>
  );
}

function AtRow({ words, full, onAdd }: { words: string; full: boolean; onAdd(): void }) {
  return (
    <li className="alert-new">
      <Icon name="bell" size={18} />
      <span>{words}</span>
      <PlusButton words={words} full={full} onAdd={onAdd} />
    </li>
  );
}

/** «[10] [minuti ▾] prima dell'inizio» and its +. */
function BeforeRow({ of, full, onAdd }: { of: 'start' | 'end'; full: boolean; onAdd(x: AlertAt): void }) {
  const [n, setN] = useState('10');
  const [unit, setUnit] = useState<Unit>('min');
  const words = of === 'start' ? "prima dell'inizio" : 'prima della fine';
  const valid = /^[1-9]\d{0,2}$/.test(n);
  const reset = () => { setN('10'); setUnit('min'); };
  return (
    <li className={n !== '10' || unit !== 'min' ? 'alert-new edited' : 'alert-new'}>
      <Icon name="bell" size={18} />
      <span className="alert-fields">
        <input type="text" inputMode="numeric" className="alert-n" aria-label={`Quanto ${words}`} value={n}
          onChange={e => setN(e.target.value.replace(/\D/g, '').slice(0, 3))} />
        <MenuSelect<Unit> label={`Unità ${words}`} value={unit} options={UNITS} onChange={setUnit} />
        <span>{words}</span>
      </span>
      <PlusButton words={words} disabled={!valid} full={full} onAdd={() => { onAdd({ of, before: Number(n) * MINUTES[unit] }); reset(); }} />
    </li>
  );
}

/**
 * The open rows of a date without an hour (user's choices, 2026-11-19): «il giorno stesso alle [9:00]» and «[1] giorni
 * prima alle [9:00]», each with its +. Before, a «Quando» menu between the two.
 */
function AddDayRows({ full, onAdd }: { full: boolean; onAdd(x: AlertAt): void }) {
  return (
    <>
      <DayRow before={false} full={full} onAdd={onAdd} />
      <DayRow before full={full} onAdd={onAdd} />
    </>
  );
}

function DayRow({ before, full, onAdd }: { before: boolean; full: boolean; onAdd(x: AlertAt): void }) {
  const [n, setN] = useState('1');
  // 10:00 for a new one (user's choice, 2026-11-20); DAY_HOUR stays the hour of an alert saved without one.
  const [at, setAt] = useState(NEW_DAY_HOUR);
  const words = before ? 'giorni prima' : 'il giorno stesso';
  const valid = !before || /^[1-9]\d?$/.test(n);
  const edited = (before && n !== '1') || at !== NEW_DAY_HOUR;
  const reset = () => { setN('1'); setAt(NEW_DAY_HOUR); };
  return (
    <li className={edited ? 'alert-new edited' : 'alert-new'}>
      <Icon name="bell" size={18} />
      <span className="alert-fields">
        {before && <input type="text" inputMode="numeric" className="alert-n" aria-label="Quanti giorni prima" value={n}
          onChange={e => setN(e.target.value.replace(/\D/g, '').slice(0, 2))} />}
        <span>{words} alle</span>
        {/* The hours float over the page as the other menus, a short list that scrolls inside, opening on the hour set
            (user's choice, 2026-11-20). Before, the list opened under its button inside the panel and made it longer:
            then the only menu that did not float (2026-11-19: a menu over the page overflowed the panel, «bruttino» as a
            grid, «così grande» as wide as the panel). */}
        <PopMenu className="btn select" buttonLabel={`Ora ${words}`} label={`${at.replace(/^0/, '')} ▾`} menuLabel={`Ora ${words}`} menuClass="hours" roomBelow={240}>
          {close => HALF_HOURS.map(([v, t]) => <MenuChoice key={v} label={t} value={v} checked={v === at} onChoose={() => { close(); setAt(v); }} />)}
        </PopMenu>
      </span>
      <PlusButton words={words} disabled={!valid} full={full} onAdd={() => { onAdd({ of: 'day', before: before ? Number(n) : 0, at }); reset(); }} />
    </li>
  );
}
