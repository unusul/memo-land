import { bump, counterStats, countOn, removeCounter, resetDay } from '@attivita/core';
import type { Activity, CounterBar, CounterSpan } from '@attivita/core';
import { useRef, useState } from 'react';
import { dayParts, instantNow, today } from '../dates.js';
import { Icon } from '../shell/icons.js';
import { useToast } from '../shell/toast.js';

const SPANS: Array<[CounterSpan, string]> = [['day', 'Giorno'], ['week', 'Settimana'], ['month', 'Mese']];
const NOW_LABEL: Record<CounterSpan, string> = { day: 'Oggi', week: 'Questa settimana', month: 'Questo mese' };
const PER: Record<CounterSpan, string> = { day: 'al giorno', week: 'a settimana', month: 'al mese' };

/** Under a bar: the weekday, the Monday of the week («23/11»), the month. */
function barLabel(span: CounterSpan, b: CounterBar): string {
  const p = dayParts(b.from);
  return span === 'day' ? p.weekday : span === 'week' ? `${p.day}/${Number(b.from.slice(5, 7))}` : p.month;
}

const number = (n: number) => n.toLocaleString('it-IT', { maximumFractionDigits: 1 });

/**
 * The counter in the detail (user's choices, 2026-11-25): today's count with − and +, «Azzera» bringing today back to
 * 0 (with Annulla; the days before stay), and the statistics in three tabs, Giorno / Settimana / Mese, each in bars
 * with the current period's total and the average.
 */
export function CounterView({ activity: a, editable, change }: {
  activity: Activity; editable: boolean; change(next: () => Activity): Promise<unknown>;
}) {
  const toast = useToast();
  const [span, setSpan] = useState<CounterSpan>('day');
  const latest = useRef(a);
  latest.current = a;
  const day = today();
  const n = countOn(a, day);
  const stats = counterStats(a, span, day);
  const top = Math.max(1, ...stats.bars.map(b => b.total));
  const reset = () => {
    void change(() => resetDay(a, day, instantNow())).then(() => toast({
      text: `«${a.title}» azzerato per oggi`,
      undo: () => { void change(() => bump(latest.current, day, n, instantNow())); },
    }));
  };
  return (
    <section className="counter stack" aria-label="Contatore">
      <div className="counter-today">
        <span className="muted">Oggi</span>
        {editable && <button type="button" className="icon-choice" aria-label="Uno in meno" disabled={n === 0}
          onClick={() => void change(() => bump(a, day, -1, instantNow()))}><span aria-hidden="true">−</span></button>}
        <b className="counter-big" aria-label={`Oggi ${n}`}>{n}</b>
        {editable && <button type="button" className="icon-choice" aria-label="Uno in più"
          onClick={() => void change(() => bump(a, day, 1, instantNow()))}><Icon name="plus" size={20} /></button>}
        {editable && n > 0 && <button type="button" className="link quiet" onClick={reset}>Azzera</button>}
      </div>
      <div className="seg" role="radiogroup" aria-label="Statistiche per">
        {SPANS.map(([s, label]) => <button key={s} type="button" role="radio" aria-checked={span === s} onClick={() => setSpan(s)}>{label}</button>)}
      </div>
      <p className="counter-sum">{NOW_LABEL[span]} <b>{number(stats.current)}</b> · media {number(stats.average)} {PER[span]}</p>
      <ol className="counter-bars" aria-label={`Totali per ${SPANS.find(([s]) => s === span)![1].toLowerCase()}`}>
        {stats.bars.map(b => (
          <li key={b.from} aria-label={`${barLabel(span, b)}: ${b.total}`}>
            <span className="n">{b.total || ''}</span>
            <span className="bar" style={{ height: `${(b.total / top) * 100}%` }} />
            <span className="l">{barLabel(span, b)}</span>
          </li>
        ))}
      </ol>
      {/* Taking it away takes its days too: Annulla brings them back. */}
      {editable && <button type="button" className="link quiet counter-remove" onClick={() => {
        const kept = a.counter!;
        void change(() => removeCounter(a, instantNow())).then(() => toast({
          text: 'Contatore tolto', undo: () => { void change(() => ({ ...latest.current, counter: kept, updatedAt: instantNow() })); },
        }));
      }}>Togli il contatore</button>}
    </section>
  );
}
