import { useMemo, useRef, useState } from 'react';
import { occurrencesBetween, parseIcs, planIcsImport } from '@attivita/core';
import type { Activity, Group, IcsEvent, IcsImportPlan } from '@attivita/core';
import { whenText } from '../activity/occurrence.js';
import { addDays, instantNow, newId, today } from '../dates.js';
import { groupName } from '../groups/GroupsView.js';
import { moveTargets } from '../groups/moveTargets.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useBackLayer } from '../shell/back.js';
import { PanelActions, PanelBackdrop, PanelHead, useEscape } from '../shell/PanelActions.js';
import { MenuSelect } from '../shell/PopMenu.js';
import { useToast } from '../shell/toast.js';
import { useWs } from '../workspace/useWorkspace.js';
import { SettingRow, SettingsCard } from './Card.js';

/**
 * Impostazioni → Import (user's choices, 2026-11-20): a Google Calendar file (`.ics`) at a time, into one group chosen in
 * the panel, Personale first; only what still counts from today; the doubles of the group skipped by title and start;
 * reminders not imported. A preview says what comes in and what is left out, and each event can be taken out. Keep
 * will be a second row here.
 */
export function ImportSection() {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; events: IcsEvent[] } | null>(null);
  const read = async (f: File | undefined) => {
    if (input.current) input.current.value = '';
    if (f) setFile({ name: f.name, events: parseIcs(await textOf(f)) });
  };
  return (
    <SettingsCard title="Import">
      <SettingRow label="Google Calendar (.ics)" hint="Gli eventi da oggi in poi, in un gruppo">
        <span className="attach">
          <button className="btn" onClick={() => input.current?.click()}>Scegli file…</button>
          <input ref={input} type="file" accept=".ics,text/calendar" hidden aria-label="File del calendario"
            onChange={e => void read(e.target.files?.[0])} />
          {file && <ImportPanel name={file.name} events={file.events} onClose={() => setFile(null)} />}
        </span>
      </SettingRow>
      <ExportHelp />
    </SettingsCard>
  );
}

/**
 * How to get the file out of Google (user's request, 2026-11-20), folded under the row: the phone app does not export,
 * and the whole export comes as a zip with one file per calendar.
 */
function ExportHelp() {
  return (
    <details className="import-help small">
      <summary>Come si esporta da Google Calendar?</summary>
      <ol>
        <li>Apri <b>calendar.google.com</b> dal computer o dal browser del telefono (l'app non esporta).</li>
        <li>Un calendario solo: Impostazioni → sotto «Impostazioni dei miei calendari» il suo nome → <b>Esporta
          calendario</b>.</li>
        <li>Tutti: Impostazioni → <b>Importa ed esporta</b> → <b>Esporta</b>.</li>
        <li>Arriva un file <b>.zip</b>: aprilo, dentro c'è un file <b>.ics</b> per ogni calendario. Scegli qui quello che
          vuoi.</li>
      </ol>
    </details>
  );
}

/** A FileReader, not `File.text()`: jsdom has only the first. */
function textOf(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}

function ImportPanel({ name, events, onClose }: { name: string; events: IcsEvent[]; onClose(): void }) {
  const ws = useWs();
  const { account } = useSession();
  const toast = useToast();
  const targets = moveTargets(ws.groups, account, null);
  const [groupId, setGroupId] = useState(targets[0]?.id ?? '');
  const [left, setLeft] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState(false);
  useBackLayer(true, onClose);
  useEscape(true, onClose);
  const group = targets.find(g => g.id === groupId);
  const me = (group && ws.engineOf(group.id)?.account) ?? account;
  const plan = useMemo(() => group && planFor(events, group, ws.activities, me), [events, group, ws.activities, me]);
  const chosen = plan?.activities.filter(a => !left.has(doubleKeyOf(a))) ?? [];
  const toggle = (a: Activity) => setLeft(s => {
    const next = new Set(s);
    if (!next.delete(doubleKeyOf(a))) next.add(doubleKeyOf(a));
    return next;
  });
  const apply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!group || chosen.length === 0) return;
    setBusy(true);
    try {
      for (const a of chosen) await ws.save(a);
      toast({ text: `${countText(chosen.length, 'evento importato', 'eventi importati')} in ${groupName(group)}` });
      onClose();
    } catch (err) {
      toast({ text: errorText(err) });
      setBusy(false);
    }
  };
  return <>
    <PanelBackdrop />
    <form className="menu panel import-panel" role="dialog" aria-label="Importa calendario" onSubmit={e => void apply(e)}>
      <PanelHead title="Importa calendario" onCancel={onClose} />
      <p className="small muted">{name}</p>
      {targets.length === 0 ? <p>Nessun gruppo dove importare.</p> : <>
        <div className="import-group">
          <span>Gruppo</span>
          <MenuSelect label="Gruppo" value={groupId} options={targets.map(g => [g.id, groupName(g)] as const)}
            onChange={id => { setGroupId(id); setLeft(new Set()); }} />
        </div>
        {plan && <Summary plan={plan} chosen={chosen.length} />}
        {plan && plan.activities.length > 0 && (
          <ul className="import-list" aria-label="Eventi da importare">
            {plan.activities.map(a => (
              <li key={doubleKeyOf(a)}>
                <label>
                  <input type="checkbox" checked={!left.has(doubleKeyOf(a))} onChange={() => toggle(a)} />
                  <span>{a.title}</span>
                  <span className="small muted">{whenLine(a)}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </>}
      <PanelActions applyLabel="Importa" disabled={busy || chosen.length === 0} onCancel={onClose} />
    </form>
  </>;
}

function planFor(events: IcsEvent[], group: Group, activities: Activity[], me: string): IcsImportPlan {
  return planIcsImport({ events, groupId: group.id, zone: group.timeZone, existing: activities.filter(a => a.groupId === group.id),
    today: today(), accountId: me, now: instantNow(), newId });
}

/** What comes in, then each reason something is left out, then the reminders (user's choice, 2026-11-20). */
function Summary({ plan, chosen }: { plan: IcsImportPlan; chosen: number }) {
  const series = plan.activities.filter(a => a.props.repeat).length;
  const out = [
    plan.duplicates > 0 && countText(plan.duplicates, 'già presente', 'già presenti'),
    plan.past > 0 && countText(plan.past, 'passato', 'passati'),
    plan.cancelled > 0 && countText(plan.cancelled, 'annullato', 'annullati'),
    plan.unknownZone > 0 && `${plan.unknownZone} con un fuso sconosciuto`,
  ].filter((s): s is string => typeof s === 'string');
  return (
    <div className="import-summary" aria-live="polite">
      <p>{plan.activities.length === 0 ? 'Niente da importare.'
        : `${countText(chosen, 'evento', 'eventi')} da importare${series > 0 ? `, di cui ${countText(series, 'serie', 'serie')}` : ''}.`}</p>
      {out.length > 0 && <p className="small muted">Saltati: {out.join(' · ')}</p>}
      {plan.withAlarms > 0 && <p className="small muted">I promemoria di Google non vengono importati: mettili con la campanella.</p>}
    </div>
  );
}

const countText = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The start as the detail says it; for a series the next time from today, not its first (a series born in 2023 said
 * «lun 4 set 2023»), and «si ripete».
 */
function whenLine(a: Activity): string {
  if (!a.props.repeat) {
    const start = a.props.schedule?.start ?? a.props.due;
    return start ? whenText(start) : '';
  }
  const day = today();
  const next = occurrencesBetween(a, `${day}T00:00`, `${addDays(day, 400)}T23:59`).find(o => !o.skipped && o.movedTo === undefined);
  return next ? `si ripete · prossima ${whenText(next.start)}` : 'si ripete';
}

/** The plan's ids change at each count, title and start do not: they name a row across group changes. */
const doubleKeyOf = (a: Activity) => `${a.title}|${a.props.schedule?.start ?? a.props.due ?? ''}`;
