import { useState } from 'react';
import type { Activity } from '@attivita/core';
import { MAX_ACTIVITY_ALERTS, alertListOf, alertsOf, setActivityAlert, useBarPrefs } from '../groups/barPrefs.js';
import type { AlertAt } from '../groups/barPrefs.js';
import { useSession } from '../session/SessionContext.js';
import { useBackLayer } from '../shell/back.js';
import { Icon } from '../shell/icons.js';
import { PanelActions, PanelBackdrop, PanelHead, useEscape } from '../shell/PanelActions.js';
import { MenuSelect } from '../shell/PopMenu.js';
import { useTelegramStatus } from '../telegram/state.js';

type Mode = 'settings' | 'here' | 'none';
type Unit = 'min' | 'h' | 'd';
interface Row { of: 'start' | 'end'; n: string; unit: Unit }
const MINUTES: Record<Unit, number> = { min: 1, h: 60, d: 1440 };
const UNITS: ReadonlyArray<readonly [Unit, string]> = [['min', 'minuti'], ['h', 'ore'], ['d', 'giorni']];
const MODES: ReadonlyArray<readonly [Mode, string]> = [['settings', 'Come in Impostazioni'], ['here', 'Scelti qui'], ['none', 'Nessuno']];

const rowOf = ({ of, before }: AlertAt): Row => {
  const unit: Unit = before > 0 && before % 1440 === 0 ? 'd' : before > 0 && before % 60 === 0 ? 'h' : 'min';
  return { of, n: String(before / MINUTES[unit]), unit };
};
const shortBefore = (m: number) => (m % 1440 === 0 ? `${m / 1440} g` : m % 60 === 0 ? `${m / 60} h` : `${m} min`);

/**
 * What the bell's hint says is set (user's choice, 2026-11-18): «inizio −20 min, fine −15 min», «nessuno», «come in
 * Impostazioni (all'inizio)».
 */
export function alertSummary(list: AlertAt[] | null, general: { start: boolean; end: boolean }): string {
  if (list === null) {
    const g = general.start && general.end ? "all'inizio e alla fine" : general.end ? 'alla fine' : general.start ? "all'inizio" : 'nessuno';
    return `come in Impostazioni (${g})`;
  }
  if (list.length === 0) return 'nessuno';
  return list.map(x => `${x.of === 'start' ? 'inizio' : 'fine'}${x.before ? ` −${shortBefore(x.before)}` : ''}`).join(', ');
}

/**
 * The bell of an activity with a time (user's choices, 2026-11-18): a panel as Ripeti's with the activity's own Telegram
 * alerts: as in Impostazioni, none, or a list of up to five, each at the start or at the end and some minutes, hours or
 * days before («+ Aggiungi avviso»). The person's only, as «In evidenza»; lit when the activity has a choice of its own.
 * Before, a small menu of fixed choices. Not where there is no server (the demo).
 */
export function AlertButton({ activity: a, me }: { activity: Activity; me: string }) {
  const { telegram } = useSession();
  const status = useTelegramStatus();
  useBarPrefs();
  const [open, setOpen] = useState(false);
  useBackLayer(open, () => setOpen(false));
  useEscape(open, () => setOpen(false));
  const timed = a.props.schedule !== undefined || (a.props.due?.length ?? 0) > 10;
  if (!telegram || !timed) return null;
  const general = { start: status?.start ?? true, end: status?.end ?? false };
  const saved = alertsOf(me)[a.id];
  const list = alertListOf(saved, general);
  return (
    <span className="attach">
      <button type="button" className={`icon-choice small${saved ? ' on' : ''}`} aria-label="Avvisi su Telegram" aria-expanded={open}
        title={`Avvisi: ${alertSummary(list, general)}`} onClick={() => setOpen(true)}>
        <Icon name="bell" size={18} />
      </button>
      {open && <>
        <PanelBackdrop />
        <div className="menu panel" role="dialog" aria-label="Avvisi su Telegram">
          <PanelHead title="Avvisi su Telegram" onCancel={() => setOpen(false)} />
          <AlertForm list={list} general={general} hasEnd={a.props.schedule?.end !== undefined} linked={status?.linked === true}
            onCancel={() => setOpen(false)}
            onSave={next => { setActivityAlert(me, a.id, next === 'settings' ? undefined : next === 'none' ? { mode: 'none' } : { mode: 'here', list: next }); setOpen(false); }} />
        </div>
      </>}
    </span>
  );
}

function AlertForm({ list, general, hasEnd, linked, onCancel, onSave }: {
  list: AlertAt[] | null; general: { start: boolean; end: boolean }; hasEnd: boolean; linked: boolean;
  onCancel(): void; onSave(next: 'settings' | 'none' | AlertAt[]): void;
}) {
  const [mode, setMode] = useState<Mode>(list === null ? 'settings' : list.length === 0 ? 'none' : 'here');
  const fromSettings: AlertAt[] = [...(general.start ? [{ of: 'start' as const, before: 0 }] : []), ...(general.end && hasEnd ? [{ of: 'end' as const, before: 0 }] : [])];
  const first: AlertAt[] = list && list.length > 0 ? list : fromSettings.length > 0 ? fromSettings : [{ of: 'start', before: 0 }];
  const [rows, setRows] = useState<Row[]>(() => first.map(rowOf));
  const change = (i: number, r: Partial<Row>) => setRows(rs => rs.map((x, k) => (k === i ? { ...x, ...r } : x)));
  const valid = rows.every(r => /^\d{1,3}$/.test(r.n));
  const submit = () => {
    if (mode !== 'here') return onSave(mode);
    const seen = new Set<string>();
    const next = rows.map((r): AlertAt => ({ of: hasEnd ? r.of : 'start', before: Number(r.n) * MINUTES[r.unit] }))
      .filter(x => { const k = `${x.of}${x.before}`; if (seen.has(k)) return false; seen.add(k); return true; });
    onSave(next.length > 0 ? next : 'none');
  };
  return (
    <form className="alert-form" onSubmit={e => { e.preventDefault(); if (valid) submit(); }}>
      {!linked && <p className="muted small">Collega Telegram in Impostazioni perché arrivino.</p>}
      <div className="icon-row alert-modes" role="radiogroup" aria-label="Avvisi di questa attività">
        {MODES.map(([m, t]) => <button key={m} type="button" role="radio" aria-checked={mode === m} className="chip" onClick={() => setMode(m)}>{t}</button>)}
      </div>
      {mode === 'settings' && <p className="muted small">Come in Impostazioni: {alertSummary(null, general).replace(/^come in Impostazioni \((.*)\)$/, '$1')}.</p>}
      {mode === 'here' && <>
        <ul className="alert-rows">
          {rows.map((r, i) => (
            <li key={i}>
              <MenuSelect label={`Quando, avviso ${i + 1}`} value={hasEnd ? r.of : 'start'} options={hasEnd ? [['start', 'Inizio'], ['end', 'Fine']] as const : [['start', 'Inizio']] as const}
                onChange={of => change(i, { of })} />
              <input type="text" inputMode="numeric" className="alert-n" aria-label={`Quanto prima, avviso ${i + 1}`} value={r.n}
                onChange={e => change(i, { n: e.target.value.replace(/\D/g, '').slice(0, 3) })} />
              <MenuSelect label={`Unità, avviso ${i + 1}`} value={r.unit} options={UNITS} onChange={unit => change(i, { unit })} />
              <span className="small">{Number(r.n) === 0 ? "all'ora esatta" : 'prima'}</span>
              <button type="button" className="link" aria-label={`Togli l'avviso ${i + 1}`} title="Togli" onClick={() => setRows(rs => rs.filter((_, k) => k !== i))}>
                <Icon name="close" size={16} />
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="add-row" disabled={rows.length >= MAX_ACTIVITY_ALERTS}
          onClick={() => setRows(rs => [...rs, { of: 'start', n: '10', unit: 'min' }])}>
          <Icon name="plus" size={16} /> Aggiungi avviso
        </button>
        {!hasEnd && <p className="muted small">Senza durata non ci sono avvisi sulla fine.</p>}
      </>}
      <PanelActions disabled={!valid} onCancel={onCancel} />
    </form>
  );
}
