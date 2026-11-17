import { useEffect, useState } from 'react';
import { anchorOf, removeProp, setProp } from '@attivita/core';
import type { AccountId, Activity, Instant, LocalDate, LocalDateTime, Unit } from '@attivita/core';
import { localNow, today } from '../dates.js';
import { noteChoice, topChoices } from '../usage/choicesStore.js';
import { DatePicker, DaysPicker, shortDay } from './DatePicker.js';
import { MenuSelect } from '../shell/PopMenu.js';
import { PanelActions } from '../shell/PanelActions.js';
import { UNIT_NAMES, WEEKDAYS, describeRepeat, nextHour, specOf, toRepeat, weekdayOf } from './timing.js';
import type { DayTimes, RepeatSpec, Weekday } from './timing.js';

const UNITS: Unit[] = ['day', 'week', 'month', 'year'];
/** A new Ripeti opens on «seleziona date», the first of the modes (user's choice, 2026-11-17; before, «a date fisse»). */
const DEFAULT: RepeatSpec = { mode: 'dates', every: 1, unit: 'week', weekdays: [], monthly: 'day' };

const DAY_NAMES = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
const everyText = (n: number, unit: Unit) => (n === 1 ? `ogni ${UNIT_NAMES[unit][0]}` : `ogni ${n} ${UNIT_NAMES[unit][1]}`);

/**
 * The line under the mode, an example made of the numbers written (user's choice, 2026-11-17): «a calendario» and «da
 * quando la completi» alone said nothing to who read them.
 */
function RepeatExample({ spec, n, start }: { spec: RepeatSpec; n: number; start: string }) {
  if (spec.mode === 'fromCompletion') {
    const rule = `${everyText(n, spec.unit)} da quando la completi`;
    const days = spec.unit === 'day' && n < 7
      ? ` La fai lunedì → torna ${DAY_NAMES[(1 + n) % 7]}; se la fai mercoledì → torna ${DAY_NAMES[(3 + n) % 7]}.` : '';
    return <p className="repeat-example">Esempio: <b>annaffia le piante, {rule}</b>: si conta dal giorno in cui la segni fatta.{days}</p>;
  }
  const rule = start ? describeRepeat(toRepeat({ ...spec, every: n }, start)) : everyText(n, spec.unit);
  return <p className="repeat-example">Esempio: <b>riunione, {rule}</b>, a date fisse: torna alle sue date anche se la volta prima non l'hai fatta.</p>;
}

/** "Ogni N unità", weekdays or day of the month, calendar or from completion; says where the series starts. */
export function RepeatForm({ activity: a, me, now, onApply, onPending, onCancel }: {
  activity: Activity; me: AccountId; now: Instant; onApply(next: Activity): void; onPending?: ((build: (() => Activity) | null) => void) | undefined;
  onCancel?: (() => void) | undefined;
}) {
  const stored = a.props.repeat ? specOf(a.props.repeat) : null;
  const [spec, setSpec] = useState(stored ?? DEFAULT);
  const [count, setCount] = useState(String(stored?.every ?? 1));
  const [from, setFrom] = useState<LocalDate>(today());
  // The series starts today unless the person asks for another day: the engine needs the day, the person rarely does.
  const [asking, setAsking] = useState(false);
  // The series' last day (2026-11-16): «per sempre» until the person asks for one.
  const [until, setUntil] = useState<LocalDate | null>(stored?.until ?? null);
  const [ending, setEnding] = useState(until !== null);
  const anchor = anchorOf(a);
  const start: LocalDate | LocalDateTime = anchor ?? from;
  const n = Number(count);
  const endTooEarly = ending && until !== null && until < start.slice(0, 10);
  const valid = Number.isInteger(n) && n > 0 && start !== '' && !endTooEarly && Object.values(spec.times ?? {}).every(t => !t?.end || t.end >= t.start);
  const set = (patch: Partial<RepeatSpec>) => setSpec(s => ({ ...s, ...patch }));
  // «A date scelte» (2026-11-17): a month to tap in place of the rule, its count, its days and its end.
  const chosen = spec.mode === 'dates';

  // Each day's time starts as the schedule's; only the days that differ are kept with a time of their own. With no
  // schedule yet, the first time written among the days is the one the schedule gets, and the days left empty take it.
  // On an activity with no date at all the days come filled with the next full hour, until the person empties one:
  // then the series is of whole days. One with a due date keeps its fields empty: its day was chosen without a time.
  const [suggested, setSuggested] = useState<Base | null>(() => (anchor ? null : nextHour(localNow())));
  const scheduled: Base | null = a.props.schedule ? { start: a.props.schedule.start.slice(11, 16), end: a.props.schedule.end?.slice(11, 16) } : null;
  const daysOf = (s: RepeatSpec): Weekday[] => s.weekdays.length ? WEEKDAYS.map(([d]) => d).filter(d => s.weekdays.includes(d)) : [weekdayOf(start)];
  const weekly = (s: RepeatSpec) => s.mode === 'calendar' && s.unit === 'week';
  const baseOf = (s: RepeatSpec): Base | null => scheduled ?? (!weekly(s) ? null : suggested ?? daysOf(s).map(d => s.times?.[d]).find(t => t?.start) ?? null);
  const base = baseOf(spec);
  const own = (s: RepeatSpec): RepeatSpec => ({ ...s, times: baseOf(s) ? differing(s.times, baseOf(s)!) : {} });
  /** The activity with the date the series starts from: its own, or the schedule a day's time asks for, or a due date. */
  function dated(s: RepeatSpec): Activity {
    const b = a.props.schedule ? null : baseOf(s);
    if (!b) return anchor ? a : setProp(a, 'due', from, me, now);
    const day = start.slice(0, 10);
    const timed = setProp(a, 'schedule', { start: `${day}T${b.start}`, ...(b.end ? { end: `${day}T${b.end}` } : {}) }, me, now);
    return a.props.due === undefined ? timed : removeProp(timed, 'due', me, now);
  }
  const ended = (s: RepeatSpec): RepeatSpec => { const { until: _old, ...rest } = s; return ending && until ? { ...rest, until } : rest; };
  const build = (s: RepeatSpec) => setProp(dated(s), 'repeat', toRepeat(own(ended(s)), start), me, now);

  function apply(s: RepeatSpec) {
    // Days chosen belong to this activity alone: not a choice to offer again on another one.
    if (s.mode !== 'dates') noteChoice(me, 'repeat', JSON.stringify(s));
    onApply(build(s));
  }

  // Chiudi saves what the form holds once it differs from what it opened with.
  const [opened] = useState(() => JSON.stringify({ spec, count, from, until, ending }));
  useEffect(() => {
    const changed = JSON.stringify({ spec, count, from, until, ending }) !== opened;
    onPending?.(changed && valid ? () => build({ ...spec, every: n }) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, count, from, until, ending]);

  return (
    <div className="stack">
      {/* The mode first, always (user's choice, 2026-11-17): what follows depends on it. */}
      <MenuSelect label="Modo" value={spec.mode} options={[['dates', 'seleziona date'], ['calendar', 'a date fisse'], ['fromCompletion', 'da quando la completi']] as const}
        onChange={mode => set({ mode })} />
      {/* The rules used before: nothing to offer among days chosen one by one. */}
      {!chosen && <div className="chips">
        {topChoices(me, 'repeat').map(choice => (
          <button key={choice} type="button" className="chip" onClick={() => apply(JSON.parse(choice) as RepeatSpec)}>
            {describeRepeat(toRepeat(JSON.parse(choice) as RepeatSpec, start))}
          </button>
        ))}
      </div>}
      <form className="form" onSubmit={e => { e.preventDefault(); if (valid) apply({ ...spec, every: n }); }}>
        {/* One sentence, «Ripeti ogni 1 anno», kept together on a phone (user's choice, 2026-11-17: «ogni» alone over a
            field as wide as the panel read badly); only the mode goes to the next line when there is no room. */}
        {!chosen && <span className="repeat-every">
          <span>Ripeti ogni</span>
          <input aria-label="Ogni" type="number" min="1" step="1" className="num" value={count} onChange={e => setCount(e.target.value)} />
          <MenuSelect label="Unità di ripetizione" value={spec.unit} options={UNITS.map(u => [u, UNIT_NAMES[u][n === 1 ? 0 : 1]] as const)} onChange={unit => set({ unit })} />
        </span>}
        {chosen ? <ChosenDays start={start} dates={spec.dates ?? []} fromSchedule={a.props.schedule !== undefined} timeOf={scheduled}
          onChange={dates => set({ dates })} /> : <RepeatExample spec={spec} n={n} start={start} />}
        {!chosen && spec.mode === 'calendar' && spec.unit === 'week' && <WeekdayToggles value={spec.weekdays} onChange={weekdays => set({ weekdays })} />}
        {!chosen && weekly(spec) && start && <DayTimeRows days={daysOf(spec)} times={spec.times ?? {}} base={base} onChange={times => set({ times })}
          onEmpty={scheduled ? undefined : () => setSuggested(null)} />}
        {!chosen && spec.mode === 'calendar' && spec.unit === 'month' && start && (
          <MenuSelect label="Giorno del mese" value={spec.monthly}
            options={(['day', 'nth'] as const).map(m => [m, monthlyLabel(m, describeRepeat(toRepeat({ ...spec, monthly: m }, start)).split(', ')[1] ?? m)] as const)}
            onChange={monthly => set({ monthly })} />
        )}
        {anchor
          ? !chosen && <span className="muted">parte dalla {a.props.schedule ? 'data' : 'scadenza'}, {anchor.replace('T', ' ')}</span>
          : asking
            ? <span className="repeat-start"><span className="muted">parte dal</span><DatePicker label="Parte dal" value={from} onChange={setFrom} /></span>
            : <span className="repeat-start muted">parte da oggi · <button type="button" className="link" aria-label="Cambia la partenza" onClick={() => setAsking(true)}>cambia</button></span>}
        {chosen ? null : ending
          ? <span className="repeat-start"><span className="muted">finisce il</span><DatePicker label="Finisce il" value={until ?? ''} onChange={setUntil} />
              <button type="button" className="link" aria-label="Per sempre" onClick={() => { setEnding(false); setUntil(null); }}>per sempre</button></span>
          : <span className="repeat-start muted">per sempre · <button type="button" className="link" aria-label="Imposta la fine" onClick={() => setEnding(true)}>imposta la fine</button></span>}
        {endTooEarly && <span className="error small" role="alert">La fine viene prima della partenza</span>}
        {onCancel ? <PanelActions disabled={!valid} onCancel={onCancel} /> : <button className="btn primary" type="submit" disabled={!valid}>Salva</button>}
      </form>
    </div>
  );
}

type Base = { start: string; end?: string | undefined };

/**
 * «A date scelte» (user's choices, 2026-11-17): a month where a tap lights a day and another puts it out, and the days
 * as chips in order, each with × but the start's own, which the date or the schedule changes. They all keep its time.
 */
function ChosenDays({ start, dates, fromSchedule, timeOf, onChange }: {
  start: LocalDate | LocalDateTime; dates: LocalDate[]; fromSchedule: boolean; timeOf: Base | null; onChange(dates: LocalDate[]): void;
}) {
  const first = start.slice(0, 10);
  const toggle = (day: LocalDate) => onChange(dates.includes(day) ? dates.filter(d => d !== day) : [...dates, day]);
  const days = [...new Set([first, ...dates])].sort();
  return (
    <>
      <p className="repeat-example">Tocca i giorni: un tocco accende, un altro spegne.</p>
      <DaysPicker label="Date scelte" fixed={first} values={dates} onToggle={toggle} />
      <div className="chips" aria-label="Giorni scelti">
        {days.map(d => (d === first
          ? <span key={d} className="chip fixed">{shortDay(d)} · da {fromSchedule ? 'Data e ora' : 'Scadenza'}</span>
          : <button key={d} type="button" className="chip" aria-label={`Togli ${shortDay(d)}`} onClick={() => toggle(d)}>{shortDay(d)} ×</button>))}
      </div>
      {timeOf && <span className="muted">tutte alle {timeOf.start}{timeOf.end ? `–${timeOf.end}` : ''}, come Data e ora</span>}
    </>
  );
}

/** The days whose time is not the schedule's; an end equal to the schedule's is kept only with a start that differs. */
function differing(times: DayTimes | undefined, base: Base): DayTimes {
  return Object.fromEntries(Object.entries(times ?? {}).filter(([, t]) => t && (t.start !== base.start || (t.end ?? base.end) !== base.end)));
}

/**
 * Beside each chosen day its start and end, filled with the schedule's: the person changes only the days that differ.
 * With no time anywhere yet the fields are empty, and a day emptied again has no time of its own.
 */
function DayTimeRows({ days, times, base, onChange, onEmpty }: {
  days: Weekday[]; times: DayTimes; base: Base | null; onChange(next: DayTimes): void; onEmpty?: (() => void) | undefined;
}) {
  const label = (d: Weekday) => WEEKDAYS.find(([k]) => k === d)![1];
  const at = (d: Weekday): Base => times[d] ?? (base ? { start: base.start, ...(base.end ? { end: base.end } : {}) } : { start: '' });
  const change = (d: Weekday, patch: Partial<Base>) => {
    const next = { ...at(d), ...patch };
    const { [d]: _emptied, ...rest } = times;
    onChange(next.start ? { ...rest, [d]: { start: next.start, ...(next.end ? { end: next.end } : {}) } } : rest);
  };
  return (
    <span className="day-times" role="group" aria-label="Orario di ogni giorno">
      {days.map(d => (
        <span key={d} className="day-time">
          <span className="d">{label(d)}</span>
          <input aria-label={`Inizio ${label(d)}`} type="time" value={at(d).start} onChange={e => { if (e.target.value || onEmpty) change(d, { start: e.target.value }); if (!e.target.value) onEmpty?.(); }} />
          <span aria-hidden="true">–</span>
          <input aria-label={`Fine ${label(d)}`} type="time" value={at(d).end ?? ''} onChange={e => change(d, { end: e.target.value || undefined })} />
        </span>
      ))}
    </span>
  );
}

function WeekdayToggles({ value, onChange }: { value: Weekday[]; onChange(next: Weekday[]): void }) {
  const toggle = (d: Weekday) => onChange(value.includes(d) ? value.filter(x => x !== d) : [...value, d]);
  return (
    <span className="chips" role="group" aria-label="Giorni">
      {WEEKDAYS.map(([d, label]) => <button key={d} type="button" className="chip" aria-pressed={value.includes(d)} onClick={() => toggle(d)}>{label}</button>)}
    </span>
  );
}

/** «il giorno 17 di ogni mese», «il terzo martedì di ogni mese» (user's choice, 2026-11-17: «il 17» alone said little). */
const monthlyLabel = (m: 'day' | 'nth', short: string) => `${m === 'day' ? short.replace(/^il /, 'il giorno ') : short} di ogni mese`;
