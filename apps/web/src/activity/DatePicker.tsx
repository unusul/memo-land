import { useState } from 'react';
import { fromFloating, toFloating } from '@attivita/core';
import type { LocalDate, LocalDateTime } from '@attivita/core';
import { addDays, today } from '../dates.js';
import { Icon } from '../shell/icons.js';
import { TimeField } from '../shell/TimeField.js';

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
/** The week starts on Monday, as in Italian calendars. */
const HEADER = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
/** «Tra una settimana» taken away (user's request, 2026-11-20): «Altra data…» reaches it. */
const SHORTCUTS: readonly [string, number][] = [['Oggi', 0], ['Domani', 1]];

type Month = string; // YYYY-MM

const utc = (day: LocalDate) => new Date(`${day}T00:00:00Z`);

/** «venerdì 20 novembre 2026»: what a screen reader says for a day, and how tests find it. */
export function dayLabel(day: LocalDate): string {
  const d = utc(day);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** The month's days from Monday on, with a blank (null) for each day of the first week before the 1st. */
export function monthGrid(month: Month): (LocalDate | null)[] {
  const first = utc(`${month}-01`);
  const blanks = (first.getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return [...Array<null>(blanks).fill(null), ...Array.from({ length }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`)];
}

function shift(month: Month, by: number): Month {
  const d = utc(`${month}-01`);
  d.setUTCMonth(d.getUTCMonth() + by);
  return d.toISOString().slice(0, 7);
}

const monthName = (month: Month) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;

/** «gio 26 nov», with the year when it is not this one: the chosen day written on its chip. */
export function shortDay(day: LocalDate, now: LocalDate = today()): string {
  const d = utc(day);
  const year = day.slice(0, 4) === now.slice(0, 4) ? '' : ` ${d.getUTCFullYear()}`;
  return `${WEEKDAYS[d.getUTCDay()]!.slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.slice(0, 3)}${year}`;
}

/**
 * One row of chips: the usual shortcuts and «Altra data…», which opens a month to leaf through (arrows for the month
 * before and after, today marked, the chosen day highlighted) on the chosen day's month, or today's. A day chosen there
 * closes the month and is written on that chip. The month used to be always open, and took half the screen where the
 * date is a detail.
 */
export function DatePicker({ label, value, onChange }: { label: string; value: LocalDate | ''; onChange(day: LocalDate): void }) {
  const [shown, setShown] = useState<Month>(() => (value || today()).slice(0, 7));
  const [open, setOpen] = useState(false);
  const now = today();
  const choose = (day: LocalDate) => { setShown(day.slice(0, 7)); setOpen(false); onChange(day); };
  const other = value !== '' && !SHORTCUTS.some(([, n]) => value === addDays(now, n));
  return (
    <div className="cal" role="group" aria-label={label} data-value={value} data-month={shown}>
      <div className="chips">
        {SHORTCUTS.map(([name, n]) => (
          <button key={name} type="button" className="chip" aria-pressed={value === addDays(now, n)} onClick={() => choose(addDays(now, n))}>{name}</button>
        ))}
        <button type="button" className="chip" aria-pressed={other} aria-expanded={open} title={other ? dayLabel(value) : undefined}
          onClick={() => setOpen(o => !o)}>{other ? shortDay(value, now) : 'Altra data…'}</button>
      </div>
      {open && <MonthView shown={shown} setShown={setShown} picked={d => d === value} now={now} choose={choose} />}
    </div>
  );
}

/**
 * Several days on one month, «a date scelte» in Ripeti (user's choice, 2026-11-17): a tap lights a day, another puts it
 * out; `fixed`, the day of the date or schedule, stays lit. Arrows for the month before and after.
 */
export function DaysPicker({ label, fixed, values, onToggle }: { label: string; fixed: LocalDate; values: LocalDate[]; onToggle(day: LocalDate): void }) {
  const [shown, setShown] = useState<Month>(() => fixed.slice(0, 7));
  return (
    <div className="cal days" role="group" aria-label={label}>
      <MonthView shown={shown} setShown={setShown} picked={d => d === fixed || values.includes(d)} now={today()} choose={d => { if (d !== fixed) onToggle(d); }} />
    </div>
  );
}

function MonthView({ shown, setShown, picked, now, choose }: {
  shown: Month; setShown(next: (m: Month) => Month): void; picked(day: LocalDate): boolean; now: LocalDate; choose(day: LocalDate): void;
}) {
  return (
    <>
      <div className="cal-head">
        <button type="button" className="icon-choice small prev" aria-label="Mese prima" onClick={() => setShown(m => shift(m, -1))}><Icon name="chevron" size={18} /></button>
        <span aria-live="polite">{monthName(shown)}</span>
        <button type="button" className="icon-choice small" aria-label="Mese dopo" onClick={() => setShown(m => shift(m, 1))}><Icon name="chevron" size={18} /></button>
      </div>
      <div className="cal-grid">
        {HEADER.map(w => <span key={w} className="wd" aria-hidden="true">{w}</span>)}
        {monthGrid(shown).map((day, i) => day === null ? <span key={`blank-${i}`} /> : (
          <button key={day} type="button" aria-label={dayLabel(day)} aria-pressed={picked(day)} aria-current={day === now ? 'date' : undefined}
            onClick={() => choose(day)}>{Number(day.slice(8))}</button>
        ))}
      </div>
    </>
  );
}

export const minutesBetween = (start: LocalDateTime, end: LocalDateTime): number => (toFloating(end).getTime() - toFloating(start).getTime()) / 60_000;

export function plusMinutes(at: LocalDateTime, minutes: number): LocalDateTime {
  const d = toFloating(at);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return fromFloating(d, false);
}

/** How long an event lasts, in words beside its end: «45 min», «1 h», «2 h 30 min». */
export const durationWords = (minutes: number): string =>
  minutes < 60 ? `${minutes} min` : minutes % 60 === 0 ? `${minutes / 60} h` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;

/**
 * An optional end on the same day, written or chosen, and how long the event lasts in words beside it (user's choice,
 * 2026-11-20, after Tempo). Empty, only the start. Before, four chips «nessuna», «30 min», «1 ora», «2 ore» and the end.
 */
export function DurationRow({ start, end, onChange }: { start: LocalDateTime | ''; end: LocalDateTime | ''; onChange(end: LocalDateTime | ''): void }) {
  const minutes = start && end ? minutesBetween(start, end) : null;
  return (
    <div className="duration" role="group" aria-label="Durata">
      {/* Not before the start (user's request, 2026-11-20): the half hours up to it are not in the list. */}
      <label className="muted time-label">fine <TimeField label="Fine" disabled={!start} allowEmpty after={start ? start.slice(11, 16) : undefined} value={end ? end.slice(11, 16) : ''}
        onChange={t => onChange(t && start ? `${start.slice(0, 10)}T${t}` : '')} /></label>
      {minutes !== null && minutes > 0 && <span className="muted duration-words">{durationWords(minutes)}</span>}
    </div>
  );
}

/**
 * A day on the calendar and a time, written or chosen from the half hours (2026-11-20; before, the browser's own time
 * field). A new day starts at 09:00.
 */
export function DateTimePicker({ label, value, onChange }: { label: string; value: LocalDateTime | ''; onChange(at: LocalDateTime): void }) {
  const day = value.slice(0, 10);
  const time = value.slice(11, 16);
  return (
    <div className="cal-time">
      <DatePicker label={label} value={day} onChange={d => onChange(`${d}T${time || '09:00'}`)} />
      <label className="muted time-label">alle <TimeField label="Ora" disabled={!day} value={time}
        onChange={t => { if (t) onChange(`${day}T${t}`); }} /></label>
    </div>
  );
}
