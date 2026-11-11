import { buildAgenda, needsAttention } from '@attivita/core';
import { useAgendaSources } from '../agenda/sources.js';
import { today } from '../dates.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

const LONG_DATE = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The header and the way to the agenda (which is not in the menu): today's date, how many open things today holds,
 * and in coral what waits for the person (overdue, proposals).
 */
export function TodayTitle({ current, onClick }: { current: boolean; onClick(): void }) {
  const ws = useWs();
  const { account } = useSession();
  const sources = useAgendaSources();
  const day = today();
  const open = (buildAgenda(sources, `${day}T00:00`, `${day}T23:59`).days[day] ?? []).filter(it => !it.done).length;
  const waits = needsAttention(sources, account, day);
  const urgent = [
    ...(waits.overdue.length ? [plural(waits.overdue.length, 'scaduta', 'scadute')] : []),
    ...(waits.proposed.length ? [plural(waits.proposed.length, 'proposta', 'proposte')] : []),
  ].join(' · ');
  return (
    <button className="today-title" aria-current={current ? 'page' : undefined} onClick={onClick}>
      <span className="kicker">Agenda</span>
      <b>{LONG_DATE.format(new Date(`${day}T12:00`))}</b>
      <small>
        {!ws.loaded ? '…' : open === 0 ? 'niente in agenda oggi' : plural(open, 'cosa oggi', 'cose oggi')}
        {ws.loaded && urgent && <> · <span className="urgent">{urgent}</span></>}
      </small>
    </button>
  );
}
