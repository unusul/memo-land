import { useState } from 'react';
import { fromFloating, toFloating } from '@attivita/core';
import type { LocalDate, LocalDateTime } from '@attivita/core';
import { addDays, today } from '../dates.js';
import { Icon } from '../shell/icons.js';

const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const WEEKDAYS = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
/** The week starts on Monday, as in Italian calendars. */
const HEADER = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const SHORTCUTS: readonly [string, number][] = [['Oggi', 0], ['Domani', 1], ['Tra una settimana', 7]];

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
      {open && <MonthView shown={shown} setShown={setShown} value={value} now={now} choose={choose} />}
    </div>
  );
}

function MonthView({ shown, setShown, value, now, choose }: {
  shown: Month; setShown(next: (m: Month) => Month): void; value: LocalDate | ''; now: LocalDate; choose(day: LocalDate): void;
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
          <button key={day} type="button" aria-label={dayLabel(day)} aria-pressed={day === value} aria-current={day === now ? 'date' : undefined}
            onClick={() => choose(day)}>{Number(day.slice(8))}</button>
        ))}
      </div>
    </>
  );
}

const DURATIONS: readonly [string, number | null][] = [['nessuna', null], ['30 min', 30], ['1 ora', 60], ['2 ore', 120]];

export const minutesBetween = (start: LocalDateTime, end: LocalDateTime): number => (toFloating(end).getTime() - toFloating(start).getTime()) / 60_000;

export function plusMinutes(at: LocalDateTime, minutes: number): LocalDateTime {
  const d = toFloating(at);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return fromFloating(d, false);
}

/**
 * An optional duration under the time: none, the usual lengths, or an end of one's own on the same day. It says the end
 * the event gets; «nessuna» leaves only the start.
 */
export function DurationRow({ start, end, onChange }: { start: LocalDateTime | ''; end: LocalDateTime | ''; onChange(end: LocalDateTime | ''): void }) {
  const minutes = start && end ? minutesBetween(start, end) : null;
  return (
    <div className="duration chips" role="group" aria-label="Durata">
      <span className="muted">durata</span>
      {DURATIONS.map(([name, m]) => (
        <button key={name} type="button" className="chip" aria-pressed={minutes === m} disabled={!start}
          onClick={() => onChange(m === null || !start ? '' : plusMinutes(start, m))}>{name}</button>
      ))}
      <label className="muted">fine <input aria-label="Fine" type="time" disabled={!start} value={end ? end.slice(11, 16) : ''}
        onChange={e => onChange(e.target.value && start ? `${start.slice(0, 10)}T${e.target.value}` : '')} /></label>
    </div>
  );
}

/** A day on the calendar and a time in its field (the time keeps the browser's own field). A new day starts at 09:00. */
export function DateTimePicker({ label, value, onChange }: { label: string; value: LocalDateTime | ''; onChange(at: LocalDateTime): void }) {
  const day = value.slice(0, 10);
  const time = value.slice(11, 16);
  return (
    <div className="cal-time">
      <DatePicker label={label} value={day} onChange={d => onChange(`${d}T${time || '09:00'}`)} />
      <label className="muted">alle <input aria-label="Ora" type="time" required disabled={!day} value={time}
        onChange={e => { if (e.target.value) onChange(`${day}T${e.target.value}`); }} /></label>
    </div>
  );
}
