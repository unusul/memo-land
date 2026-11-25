import { addUnits, toFloating } from './dates.js';
import { fail } from './errors.js';
import type { Activity, Counter, Instant, LocalDate } from './types.js';

/*
 * The counter inside an activity (user's choices, 2026-11-25): «Bicchieri d'acqua», + adds one to today's count. Each
 * day starts from 0; resetting brings today back to 0 and keeps the days before, which the statistics compare. As the
 * list, no history entry: a tap a glass would bury the history that matters.
 */

const withCounter = (a: Activity, counter: Counter | undefined, now: Instant): Activity => {
  const { counter: _old, ...rest } = a;
  return { ...rest, ...(counter ? { counter } : {}), updatedAt: now };
};
const counterOf = (a: Activity): Counter => a.counter ?? fail('NOT_FOUND', 'no counter');

export function addCounter(a: Activity, now: Instant): Activity {
  return a.counter ? a : withCounter(a, { days: {} }, now);
}

/** The counter goes, with its days. */
export function removeCounter(a: Activity, now: Instant): Activity {
  return a.counter ? withCounter(a, undefined, now) : a;
}

export function countOn(a: Activity, day: LocalDate): number {
  return a.counter?.days[day] ?? 0;
}

/** + or − on a day's count; it never goes below 0, and a day back to 0 leaves the record. */
export function bump(a: Activity, day: LocalDate, delta: number, now: Instant): Activity {
  const c = counterOf(a);
  const n = Math.max(0, (c.days[day] ?? 0) + delta);
  if (n === (c.days[day] ?? 0)) return a;
  const { [day]: _was, ...others } = c.days;
  return withCounter(a, { ...c, days: n === 0 ? others : { ...others, [day]: n } }, now);
}

/** «Azzera»: the day's count back to 0; the days before stay. */
export function resetDay(a: Activity, day: LocalDate, now: Instant): Activity {
  return bump(a, day, -countOn(a, day), now);
}

export type CounterSpan = 'day' | 'week' | 'month';

export interface CounterBar {
  /** First day of the bar (a Monday for a week, the 1st for a month). */
  from: LocalDate;
  total: number;
}

export interface CounterStats {
  /** Oldest first; the last one is the current day, week or month. */
  bars: CounterBar[];
  /** The bar of the current period. */
  current: number;
  /** Mean of the bars from the first one with a count, rounded to one decimal; 0 with no count at all. */
  average: number;
}

/** How many bars each span shows (user's choice, 2026-11-25): 7 days, 8 weeks, 6 months. */
export const COUNTER_BARS: Record<CounterSpan, number> = { day: 7, week: 8, month: 6 };

/** The bars of a span, ending with the one holding `today`. */
export function counterStats(a: Activity, span: CounterSpan, today: LocalDate): CounterStats {
  const days = a.counter?.days ?? {};
  const last = startOf(span, today);
  const bars: CounterBar[] = [];
  for (let i = COUNTER_BARS[span] - 1; i >= 0; i--) {
    const from = addUnits(last, span, -i) as LocalDate;
    const to = addUnits(from, span, 1) as LocalDate;
    const total = Object.entries(days).filter(([d]) => d >= from && d < to).reduce((s, [, n]) => s + n, 0);
    bars.push({ from, total });
  }
  const used = bars.slice(Math.max(0, bars.findIndex(b => b.total > 0)));
  const sum = used.reduce((s, b) => s + b.total, 0);
  return { bars, current: bars.at(-1)!.total, average: sum === 0 ? 0 : Math.round((sum / used.length) * 10) / 10 };
}

/** The first day of the day, week (Monday) or month holding `day`. */
function startOf(span: CounterSpan, day: LocalDate): LocalDate {
  if (span === 'day') return day;
  if (span === 'month') return `${day.slice(0, 8)}01`;
  const weekday = (toFloating(day).getUTCDay() + 6) % 7;
  return addUnits(day, 'day', -weekday) as LocalDate;
}
