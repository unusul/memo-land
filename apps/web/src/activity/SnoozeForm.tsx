import { useState } from 'react';
import type { AccountId, LocalDateTime } from '@attivita/core';
import { localNow } from '../dates.js';
import { noteChoice, topChoices } from '../usage/choicesStore.js';
import { DateTimePicker } from './DatePicker.js';
import { MenuSelect } from '../shell/PopMenu.js';
import { PanelActions } from '../shell/PanelActions.js';
import { UNIT_NAMES, describeSnooze, snoozeUntil } from './timing.js';
import type { SnoozeUnit } from './timing.js';

const UNITS = Object.keys(UNIT_NAMES) as SnoozeUnit[];

/**
 * The shortcuts a person uses snooze at once, as a menu's choices; then «tra N unità» or «oppure il» a day and time, and
 * one Applica (user's choice, 2026-11-18): it takes the line touched last, lit so it shows which one counts; «tra» at
 * first. Before, each line had a button of its own, «Rimanda» and «Rimanda al giorno scelto».
 */
export function SnoozeForm({ me, onSnooze, onCancel }: { me: AccountId; onSnooze(until: LocalDateTime): void; onCancel(): void }) {
  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState<SnoozeUnit>('day');
  const [at, setAt] = useState('');
  const [way, setWay] = useState<'relative' | 'day'>('relative');
  const n = Number(count);
  const valid = way === 'day' ? at !== '' : Number.isInteger(n) && n > 0;

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
      <form className="form snooze" onSubmit={e => { e.preventDefault(); if (!valid) return; if (way === 'day') onSnooze(at as LocalDateTime); else relative(n, unit); }}>
        <span className={`snooze-way${way === 'relative' ? ' chosen' : ''}`} onFocusCapture={() => setWay('relative')} onPointerDownCapture={() => setWay('relative')}>
          <span>tra</span>
          <input aria-label="Quanti" type="number" min="1" step="1" className="num" value={count} onChange={e => { setWay('relative'); setCount(e.target.value); }} />
          <MenuSelect<SnoozeUnit> label="Unità" value={unit} options={UNITS.map(u => [u, UNIT_NAMES[u][n === 1 ? 0 : 1]] as const)} onChange={u => { setWay('relative'); setUnit(u); }} />
        </span>
        <span className={`snooze-way${way === 'day' ? ' chosen' : ''}`}>
          <span>oppure il</span>
          <DateTimePicker label="Il giorno" value={at} onChange={v => { setWay('day'); setAt(v); }} />
        </span>
        <PanelActions disabled={!valid} applyLabel="Rimanda" onCancel={onCancel} />
      </form>
    </div>
  );
}
