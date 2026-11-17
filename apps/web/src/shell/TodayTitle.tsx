import { buildAgenda, needsAttention } from '@attivita/core';
import { useAgendaSources } from '../agenda/sources.js';
import { setAgendaMode, useAgendaMode } from '../agenda/agendaMode.js';
import type { AgendaMode } from '../agenda/agendaMode.js';
import { today } from '../dates.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

const LONG_DATE = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The header and the way to the agenda (which is not in the menu): «Agenda | Calendario», the list or the month (user's
 * choice, 2026-11-17, in place of the «Elenco · Mese» switch inside the page); then today's date, how many open things
 * today holds, and in coral what waits for the person (overdue, proposals). In the month the date line goes: the grid
 * says it.
 */
export function TodayTitle({ current, onClick }: { current: boolean; onClick(): void }) {
  const ws = useWs();
  const { account } = useSession();
  const sources = useAgendaSources();
  const day = today();
  const open = (buildAgenda(sources, `${day}T00:00`, `${day}T23:59`).days[day] ?? []).filter(it => !it.done && !it.skipped && it.movedTo === undefined).length;
  const waits = needsAttention(sources, account, day);
  const urgent = [
    ...(waits.overdue.length ? [plural(waits.overdue.length, 'scaduta', 'scadute')] : []),
    ...(waits.proposed.length ? [plural(waits.proposed.length, 'proposta', 'proposte')] : []),
  ].join(' · ');
  const mode = useAgendaMode();
  const choose = (m: AgendaMode) => { setAgendaMode(m); onClick(); };
  const view = (m: AgendaMode, label: string) => (
    <button type="button" aria-current={current && mode === m ? 'page' : undefined} className={mode === m ? 'chosen' : undefined} onClick={() => choose(m)}>{label}</button>
  );
  return (
    <div className="today-title" data-current={current || undefined}>
      <span className="kicker">{view('list', 'Agenda')}<span className="sep" aria-hidden="true">|</span>{view('month', 'Calendario')}</span>
      {!(current && mode === 'month') && (
        <button type="button" className="today-line" onClick={onClick}>
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
