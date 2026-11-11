import { useEffect, useState } from 'react';
import { anchorOf, setProp } from '@attivita/core';
import type { AccountId, Activity, Instant, LocalDate, LocalDateTime, Unit } from '@attivita/core';
import { today } from '../dates.js';
import { noteChoice, topChoices } from '../usage/choicesStore.js';
import { UNIT_NAMES, WEEKDAYS, describeRepeat, specOf, toRepeat } from './timing.js';
import type { RepeatSpec, Weekday } from './timing.js';

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

  const build = (s: RepeatSpec) => setProp(anchor ? a : setProp(a, 'due', from, me, now), 'repeat', toRepeat(s, start), me, now);

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
        {spec.mode === 'calendar' && spec.unit === 'month' && start && (
          <select aria-label="Giorno del mese" value={spec.monthly} onChange={e => set({ monthly: e.target.value as RepeatSpec['monthly'] })}>
            <option value="day">{describeRepeat(toRepeat({ ...spec, monthly: 'day' }, start)).split(', ')[1]}</option>
            <option value="nth">{describeRepeat(toRepeat({ ...spec, monthly: 'nth' }, start)).split(', ')[1]}</option>
          </select>
        )}
        {anchor
          ? <span className="muted">parte dalla {a.props.schedule ? 'data' : 'scadenza'}, {anchor.replace('T', ' ')}</span>
          : <label className="muted">parte dal <input aria-label="Parte dal" type="date" required value={from} onChange={e => setFrom(e.target.value)} /></label>}
        <button className="btn primary" type="submit" disabled={!valid}>{a.props.repeat ? 'Salva' : 'Aggiungi'}</button>
      </form>
    </div>
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
