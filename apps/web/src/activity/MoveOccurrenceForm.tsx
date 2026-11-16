import { useState } from 'react';
import type { LocalDate, LocalDateTime } from '@attivita/core';
import { DatePicker, DateTimePicker } from './DatePicker.js';

/**
 * Another day (and time) for one occurrence of a series, starting from where it is now. A series of whole days moves to
 * a day; the duration stays the series'.
 */
export function MoveOccurrenceForm({ from, onMove }: { from: LocalDate | LocalDateTime; onMove(to: LocalDate | LocalDateTime): void }) {
  const [to, setTo] = useState(from);
  const timed = from.length > 10;
  return (
    <form className="form" onSubmit={e => { e.preventDefault(); if (to !== from) onMove(to); }}>
      {timed
        ? <DateTimePicker label="Nuovo giorno" value={to} onChange={setTo} />
        : <DatePicker label="Nuovo giorno" value={to} onChange={setTo} />}
      <button className="btn primary" type="submit" disabled={to === from}>Sposta</button>
    </form>
  );
}
