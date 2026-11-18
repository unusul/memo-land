import { useRef } from 'react';
import { newActivity, setProp } from '@attivita/core';
import type { AccountId, Activity, AgendaItem, GroupId, Instant, LocalDate } from '@attivita/core';
import { addDays, newId, today } from '../dates.js';
import { Icon } from '../shell/icons.js';

/** Up to this many strips in a day; more, and one less is shown with «+N» (user's choice, 2026-11-17). */
const MAX_STRIPS = 4;
/** Far enough sideways, and mostly sideways, to turn the month and not to tap a day. */
const SWIPE_PX = 60;

const asDate = (day: LocalDate) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «Novembre 2026» for `2026-11`. */
export const monthLabel = (month: string): string => capital(asDate(`${month}-01`).toLocaleDateString('it', { month: 'long', year: 'numeric' }));
/** «Giovedì 5 novembre». */
export const dayLabel = (day: LocalDate): string => capital(asDate(day).toLocaleDateString('it', { weekday: 'long', day: 'numeric', month: 'long' }));
/** The hour a new activity added on a day of the month starts at (user's choice, 2026-11-17); Data e ora changes it. */
const ADD_AT = '09:00';

/** A new activity added from a day of the month, not saved yet: in `groupId`, Data e ora that day at 9:00. */
export function activityOnDay(day: LocalDate, groupId: GroupId, by: AccountId, now: Instant): Activity {
  return setProp(newActivity({ id: newId(), accountId: by, title: '', groupId }, now), 'schedule', { start: `${day}T${ADD_AT}` }, by, now);
}

/** The month `n` months after `month` (before, when negative). */
export function shiftMonth(month: string, n: number): string {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** The days of the grid: whole weeks from Monday, the first one holding the 1st, the last one the month's end. */
export function monthDays(month: string): LocalDate[] {
  const first = `${month}-01`;
  const lead = (asDate(first).getDay() + 6) % 7;
  const length = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  return Array.from({ length: Math.ceil((lead + length) / 7) * 7 }, (_, i) => addDays(first, i - lead));
}

/** What a day shows: all its strips up to four, else three and how many more. */
export function cellStrips<T>(items: readonly T[]): { shown: T[]; more: number } {
  if (items.length <= MAX_STRIPS) return { shown: [...items], more: 0 };
  return { shown: items.slice(0, MAX_STRIPS - 1), more: items.length - (MAX_STRIPS - 1) };
}

const WEEKDAYS = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];

/**
 * The Agenda as a month (user's choices, 2026-11-17): as a phone's calendar, each day a rounded tile apart from the
 * others with the titles cut in strips of their group's colour, done ones struck through; today's number in a pill and
 * its weekday lit. A first grid with thin lines was dropped by the user: «orribile». The arrows or a swipe on the grid turn the
 * month; a tap on a day hands it to `onDay`, which shows its rows.
 */
export function MonthView({ month, setMonth, days, kindOf, struck, onDay }: {
  month: string; setMonth(month: string): void; days: Record<LocalDate, AgendaItem[]>;
  kindOf(item: AgendaItem): string; struck(item: AgendaItem): boolean; onDay(day: LocalDate): void;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  const now = today();
  const label = monthLabel(month);
  return (
    <section className="month" aria-label="Mese">
      <div role="grid" aria-label={label} className="month-grid"
        onPointerDown={e => { start.current = { x: e.clientX, y: e.clientY }; swiped.current = false; }}
        onPointerUp={e => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const dx = e.clientX - s.x, dy = e.clientY - s.y;
          if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * 2) return;
          // The click a swipe may leave behind is not a tap on the day; it comes at once, so the next tap is one again.
          swiped.current = true;
          setTimeout(() => { swiped.current = false; }, 0);
          setMonth(shiftMonth(month, dx < 0 ? 1 : -1));
        }}
        onPointerCancel={() => { start.current = null; }}>
        {WEEKDAYS.map((d, i) => <span key={i} role="columnheader" className={i === (asDate(now).getDay() + 6) % 7 ? 'wd on' : 'wd'}>{d}</span>)}
        {monthDays(month).map(day => {
          const { shown, more } = cellStrips(days[day] ?? []);
          return (
            <button key={day} type="button" role="gridcell" data-day={day} aria-label={dayLabel(day)}
              aria-current={day === now ? 'date' : undefined} className={day.startsWith(month) ? 'cell' : 'cell other'}
              onClick={() => { if (!swiped.current) onDay(day); swiped.current = false; }}>
              <span className="n">{Number(day.slice(8, 10))}</span>
              {shown.map(it => (
                <span key={`${it.activityId}|${it.start}`} className={struck(it) ? 'strip done' : 'strip'} style={{ '--grp': kindOf(it) } as React.CSSProperties}>{it.title}</span>
              ))}
              {more > 0 && <span className="more">+{more}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/**
 * The month's name and its arrows, in the header while the Calendar is open (user's choice, 2026-11-17): first they sat
 * over the grid, under an empty header.
 */
export function MonthTitle({ month, setMonth }: { month: string; setMonth(month: string): void }) {
  return (
    <div className="month-title">
      <b className="month-name">{monthLabel(month)}</b>
      <span className="month-arrows">
        <button type="button" className="icon-choice small prev" aria-label="Mese prima" onClick={() => setMonth(shiftMonth(month, -1))}><Icon name="chevron" size={18} /></button>
        <button type="button" className="icon-choice small" aria-label="Mese dopo" onClick={() => setMonth(shiftMonth(month, 1))}><Icon name="chevron" size={18} /></button>
      </span>
    </div>
  );
}
