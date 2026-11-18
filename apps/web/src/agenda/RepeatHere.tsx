import { useState } from 'react';
import { anchorOf, can, chosenStarts, outOfCalendar, setProp, shapeOf } from '@attivita/core';
import type { Activity, Group, LocalDate } from '@attivita/core';
import { dayParts, instantNow } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { Icon } from '../shell/icons.js';
import { useToast } from '../shell/toast.js';
import { useWs } from '../workspace/useWorkspace.js';

/** How many events the list shows; with more, a search on top (user's choice, 2026-11-17). */
export const SHOWN_EVENTS = 6;

const MS_PER_DAY = 86_400_000;
/** Shapes the Calendar does not show on a day. */
const OFF_CALENDAR: ReadonlySet<string> = new Set(['waiting', 'snoozed']);
const at = (day: LocalDate) => Date.parse(`${day}T00:00:00Z`);
const short = (day: LocalDate) => { const p = dayParts(day); return `${p.day} ${p.month}`; };

/** The days an activity is on: its date or schedule, and the days chosen. */
export function daysOf(a: Activity): LocalDate[] {
  const anchor = anchorOf(a);
  if (anchor === undefined) return [];
  return chosenStarts(anchor, a.props.repeat?.mode === 'dates' ? a.props.repeat.dates : []).map(s => s.slice(0, 10));
}

/**
 * The events a day can be added to (user's choices, 2026-11-17): open, in a group the person edits, with a date, without
 * a rule or already «a date scelte», in the Calendar (not waiting nor put off), not on that day yet; the nearest first.
 */
export function repeatableOn(day: LocalDate, activities: Activity[], groupOf: (id: string) => Group | undefined, meOf: (groupId: string) => string): Activity[] {
  const distance = (a: Activity) => Math.min(...daysOf(a).map(d => Math.abs(at(d) - at(day)) / MS_PER_DAY));
  return activities
    .filter(a => {
      const group = a.groupId === null ? undefined : groupOf(a.groupId);
      const repeat = a.props.repeat;
      return a.status === 'open' && group !== undefined && !group.archived && can(group, meOf(group.id), 'editActivity')
        && (repeat === undefined || repeat.mode === 'dates') && !outOfCalendar(a) && !OFF_CALENDAR.has(shapeOf(a, group.id)) && daysOf(a).length > 0 && !daysOf(a).includes(day);
    })
    .sort((x, y) => distance(x) - distance(y) || x.title.localeCompare(y.title, 'it'));
}

/**
 * «Ripeti qui un evento», in a day of the Calendar beside «+ Aggiungi» (user's choices, 2026-11-17): the events to
 * repeat open under it, in the day's panel; one chosen gets the day among its dates and becomes «a date scelte», and
 * its row shows in the day at once. Before, another day of «andare a Roma» meant another activity.
 */
export function RepeatHere({ day }: { day: LocalDate }) {
  const ws = useWs();
  const { account } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const groupOf = (id: string) => ws.groups.find(g => g.id === id);
  const meOf = (groupId: string) => ws.engineOf(groupId)?.account ?? account;
  const all = repeatableOn(day, ws.activities, groupOf, meOf);
  const wanted = query.trim().toLowerCase();
  const shown = all.filter(a => !wanted || a.title.toLowerCase().includes(wanted)).slice(0, SHOWN_EVENTS);
  async function choose(a: Activity) {
    const dates = a.props.repeat?.mode === 'dates' ? a.props.repeat.dates : [];
    try {
      await ws.save(setProp(a, 'repeat', { mode: 'dates', dates: [...dates, day].sort() }, meOf(a.groupId!), instantNow()));
      setOpen(false);
      setQuery('');
    } catch (e) {
      toast({ text: errorText(e) });
    }
  }
  return (
    <>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen(o => !o)}><Icon name="repeat" size={18} /> Ripeti qui un evento</button>
      {open && (
        <div className="repeat-here" role="group" aria-label="Eventi da ripetere">
          {all.length > SHOWN_EVENTS && <input type="search" aria-label="Cerca un evento" placeholder="Cerca un evento" value={query} onChange={e => setQuery(e.target.value)} />}
          {shown.length === 0 ? <p className="muted small">{all.length === 0 ? 'Nessun evento da ripetere in questo giorno.' : 'Nessun evento con questo nome.'}</p> : shown.map(a => (
            <button key={a.id} type="button" className="pick" onClick={() => void choose(a)}>
              <span className="t">{a.title}</span>
              <span className="meta">{[groupOf(a.groupId!)?.kind === 'personal' ? 'Personale' : groupOf(a.groupId!)?.name, daysOf(a).map(short).join(', ')].filter(Boolean).join(' · ')}</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
