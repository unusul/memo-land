import { buildAgenda, needsAttention } from '@attivita/core';
import { useAgendaSources } from '../agenda/sources.js';
import { setShownMonth, useAgendaMode, useShownMonth } from '../agenda/agendaMode.js';
import { MonthTitle } from '../agenda/MonthView.js';
import { today } from '../dates.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

const LONG_DATE = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The header and the way to the agenda (which is not in the menu): today's date, how many open things today holds, and
 * in coral what waits for the person (overdue, proposals). In the Calendar the line goes: the grid says it. «Agenda |
 * Calendario» was on top of it for a while; it moved to the bottom, under the thumb (agenda/ViewStrip.tsx, 2026-11-17).
 */
export function TodayTitle({ current, onClick }: { current: boolean; onClick(): void }) {
  const ws = useWs();
  const { account } = useSession();
  const sources = useAgendaSources();
  const day = today();
  // An information is to know, not to do (2026-11-17): not one of today's things.
  const info = new Set(ws.activities.filter(a => a.info).map(a => a.id));
  const open = (buildAgenda(sources, `${day}T00:00`, `${day}T23:59`).days[day] ?? []).filter(it => !it.done && !it.skipped && it.movedTo === undefined && !info.has(it.activityId)).length;
  const waits = needsAttention(sources, account, day);
  const urgent = [
    ...(waits.overdue.length ? [plural(waits.overdue.length, 'scaduta', 'scadute')] : []),
    ...(waits.proposed.length ? [plural(waits.proposed.length, 'proposta', 'proposte')] : []),
  ].join(' · ');
  const mode = useAgendaMode();
  const month = useShownMonth();
  return (
    <div className="today-title">
      {current && mode === 'month' && month && <MonthTitle month={month} setMonth={setShownMonth} />}
      {!(current && mode === 'month') && (
        <button type="button" className="today-line" aria-current={current ? 'page' : undefined} onClick={onClick}>
          <b>{LONG_DATE.format(new Date(`${day}T12:00`))}</b>
          <small>
            {!ws.loaded ? '…' : open === 0 ? 'niente in agenda oggi' : plural(open, 'cosa oggi', 'cose oggi')}
            {ws.loaded && urgent && <> · <span className="urgent">{urgent}</span></>}
          </small>
        </button>
      )}
    </div>
  );
}
