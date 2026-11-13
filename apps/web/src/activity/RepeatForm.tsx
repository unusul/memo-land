import { useEffect, useState } from 'react';
import { anchorOf, setProp } from '@attivita/core';
import type { AccountId, Activity, Instant, LocalDate, LocalDateTime, Unit } from '@attivita/core';
import { today } from '../dates.js';
import { noteChoice, topChoices } from '../usage/choicesStore.js';
import { DatePicker } from './DatePicker.js';
import { UNIT_NAMES, WEEKDAYS, describeRepeat, specOf, toRepeat, weekdayOf } from './timing.js';
import type { DayTimes, RepeatSpec, Weekday } from './timing.js';

const UNITS: Unit[] = ['day', 'week', 'month', 'year'];
const DEFAULT: RepeatSpec = { mode: 'calendar', every: 1, unit: 'week', weekdays: [], monthly: 'day' };

/** "Ogni N unità", weekdays or day of the month, calendar or from completion; says where the series starts. */
export function RepeatForm({ activity: a, me, now, onApply, onPending }: {
  activity: Activity; me: AccountId; now: Instant; onApply(next: Activity): void; onPending?: ((build: (() => Activity) | null) => void) | undefined;
}) {
  const stored = a.props.repeat ? specOf(a.props.repeat) : null;
  const [spec, setSpec] = useState(stored ?? DEFAULT);
  const [count, setCount] = useState(String(stored?.every ?? 1));
  const [from, setFrom] = useState<LocalDate>(today());
  const anchor = anchorOf(a);
  const start: LocalDate | LocalDateTime = anchor ?? from;
  const n = Number(count);
  const valid = Number.isInteger(n) && n > 0 && start !== '';
  const set = (patch: Partial<RepeatSpec>) => setSpec(s => ({ ...s, ...patch }));

  // Each day's time starts as the schedule's; only the days that differ are kept with a time of their own.
  const base = a.props.schedule ? { start: a.props.schedule.start.slice(11, 16), end: a.props.schedule.end?.slice(11, 16) } : null;
  const own = (s: RepeatSpec): RepeatSpec => ({ ...s, times: base ? differing(s.times, base) : {} });
  const build = (s: RepeatSpec) => setProp(anchor ? a : setProp(a, 'due', from, me, now), 'repeat', toRepeat(own(s), start), me, now);

  function apply(s: RepeatSpec) {
    noteChoice(me, 'repeat', JSON.stringify(s));
    onApply(build(s));
  }

  // Chiudi saves what the form holds once it differs from what it opened with.
  const [opened] = useState(() => JSON.stringify({ spec, count, from }));
  useEffect(() => {
    const changed = JSON.stringify({ spec, count, from }) !== opened;
    onPending?.(changed && valid ? () => build({ ...spec, every: n }) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, count, from]);

  return (
    <div className="stack">
      <div className="chips">
        {topChoices(me, 'repeat').map(choice => (
          <button key={choice} type="button" className="chip" onClick={() => apply(JSON.parse(choice) as RepeatSpec)}>
            {describeRepeat(toRepeat(JSON.parse(choice) as RepeatSpec, start))}
          </button>
        ))}
      </div>
      <form className="form" onSubmit={e => { e.preventDefault(); if (valid) apply({ ...spec, every: n }); }}>
        <span>ogni</span>
        <input aria-label="Ogni" type="number" min="1" step="1" className="num" value={count} onChange={e => setCount(e.target.value)} />
        <select aria-label="Unità di ripetizione" value={spec.unit} onChange={e => set({ unit: e.target.value as Unit })}>
          {UNITS.map(u => <option key={u} value={u}>{UNIT_NAMES[u][n === 1 ? 0 : 1]}</option>)}
        </select>
        <select aria-label="Modo" value={spec.mode} onChange={e => set({ mode: e.target.value as RepeatSpec['mode'] })}>
          <option value="calendar">a calendario</option>
          <option value="fromCompletion">da quando la completi</option>
        </select>
        {spec.mode === 'calendar' && spec.unit === 'week' && <WeekdayToggles value={spec.weekdays} onChange={weekdays => set({ weekdays })} />}
        {spec.mode === 'calendar' && spec.unit === 'week' && base && start && (
          <DayTimeRows days={spec.weekdays.length ? WEEKDAYS.map(([d]) => d).filter(d => spec.weekdays.includes(d)) : [weekdayOf(start)]}
            times={spec.times ?? {}} base={base} onChange={times => set({ times })} />
        )}
        {spec.mode === 'calendar' && spec.unit === 'month' && start && (
          <select aria-label="Giorno del mese" value={spec.monthly} onChange={e => set({ monthly: e.target.value as RepeatSpec['monthly'] })}>
            <option value="day">{describeRepeat(toRepeat({ ...spec, monthly: 'day' }, start)).split(', ')[1]}</option>
            <option value="nth">{describeRepeat(toRepeat({ ...spec, monthly: 'nth' }, start)).split(', ')[1]}</option>
          </select>
        )}
        {anchor
          ? <span className="muted">parte dalla {a.props.schedule ? 'data' : 'scadenza'}, {anchor.replace('T', ' ')}</span>
          : <><span className="muted">parte dal</span><DatePicker label="Parte dal" value={from} onChange={setFrom} /></>}
        <button className="btn primary" type="submit" disabled={!valid}>{a.props.repeat ? 'Salva' : 'Aggiungi'}</button>
      </form>
    </div>
  );
}

type Base = { start: string; end?: string | undefined };

/** The days whose time is not the schedule's; an end equal to the schedule's is kept only with a start that differs. */
function differing(times: DayTimes | undefined, base: Base): DayTimes {
  return Object.fromEntries(Object.entries(times ?? {}).filter(([, t]) => t && (t.start !== base.start || (t.end ?? base.end) !== base.end)));
}

/** Beside each chosen day its start and end, filled with the schedule's: the person changes only the days that differ. */
function DayTimeRows({ days, times, base, onChange }: { days: Weekday[]; times: DayTimes; base: Base; onChange(next: DayTimes): void }) {
  const label = (d: Weekday) => WEEKDAYS.find(([k]) => k === d)![1];
  const at = (d: Weekday) => times[d] ?? { start: base.start, ...(base.end ? { end: base.end } : {}) };
  const change = (d: Weekday, patch: Partial<Base>) => {
    const next = { ...at(d), ...patch };
    onChange({ ...times, [d]: { start: next.start, ...(next.end ? { end: next.end } : {}) } });
  };
  return (
    <span className="day-times" role="group" aria-label="Orario di ogni giorno">
      {days.map(d => (
        <span key={d} className="day-time">
          <span className="d">{label(d)}</span>
          <input aria-label={`Inizio ${label(d)}`} type="time" value={at(d).start} onChange={e => e.target.value && change(d, { start: e.target.value })} />
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
