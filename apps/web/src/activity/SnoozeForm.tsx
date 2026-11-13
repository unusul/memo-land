import { useState } from 'react';
import type { AccountId, LocalDateTime } from '@attivita/core';
import { localNow } from '../dates.js';
import { noteChoice, topChoices } from '../usage/choicesStore.js';
import { DateTimePicker } from './DatePicker.js';
import { UNIT_NAMES, describeSnooze, snoozeUntil } from './timing.js';
import type { SnoozeUnit } from './timing.js';

const UNITS = Object.keys(UNIT_NAMES) as SnoozeUnit[];

/** "Tra N unità" or a chosen day and time; the relative choices a person uses come back as shortcuts. */
export function SnoozeForm({ me, onSnooze }: { me: AccountId; onSnooze(until: LocalDateTime): void }) {
  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState<SnoozeUnit>('day');
  const [at, setAt] = useState('');
  const n = Number(count);
  const valid = Number.isInteger(n) && n > 0;

  function relative(c: number, u: SnoozeUnit) {
    noteChoice(me, 'snooze', `${c} ${u}`);
    onSnooze(snoozeUntil(localNow(), c, u));
  }

  return (
    <div className="stack">
      <div className="chips">
        {topChoices(me, 'snooze').map(choice => {
          const [c, u] = choice.split(' ') as [string, SnoozeUnit];
          return <button key={choice} type="button" className="chip" onClick={() => relative(Number(c), u)}>{describeSnooze(Number(c), u)}</button>;
        })}
      </div>
      <form className="form" onSubmit={e => { e.preventDefault(); if (valid) relative(n, unit); }}>
        <span>tra</span>
        <input aria-label="Quanti" type="number" min="1" step="1" className="num" value={count} onChange={e => setCount(e.target.value)} />
        <select aria-label="Unità" value={unit} onChange={e => setUnit(e.target.value as SnoozeUnit)}>
          {UNITS.map(u => <option key={u} value={u}>{UNIT_NAMES[u][n === 1 ? 0 : 1]}</option>)}
        </select>
        <button className="btn primary" type="submit" disabled={!valid}>Rimanda</button>
      </form>
      <form className="form" onSubmit={e => { e.preventDefault(); if (at) onSnooze(at); }}>
        <span>oppure il</span>
        <DateTimePicker label="Il giorno" value={at} onChange={setAt} />
        <button className="btn" type="submit" disabled={!at}>Rimanda al giorno scelto</button>
      </form>
    </div>
  );
}
