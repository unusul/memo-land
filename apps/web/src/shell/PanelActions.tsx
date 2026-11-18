import { useEffect, useRef } from 'react';
import { Icon } from './icons.js';

/**
 * Annulla and Applica as two icons on a row of their own at the bottom right of a panel (user's choices, 2026-11-17):
 * the same in every panel with fields, and they no longer move sideways when what is above grows. Before, a Salva
 * button followed the fields, and the days chosen in Ripeti pushed it along. Applica submits the panel's form.
 */
export function PanelActions({ disabled = false, applyLabel = 'Applica', onCancel }: { disabled?: boolean; applyLabel?: string; onCancel(): void }) {
  return (
    <div className="panel-actions">
      <button type="button" className="icon-choice small" aria-label="Annulla" title="Annulla" onClick={onCancel}><Icon name="close" size={18} /></button>
      <button type="submit" className="icon-choice small apply" aria-label={applyLabel} title={applyLabel} disabled={disabled}><Icon name="check" size={18} /></button>
    </div>
  );
}

/** Behind an open panel: the page dims and a tap on it does nothing (user's choice, 2026-11-17: before, it saved and closed). */
export const PanelBackdrop = () => <div className="panel-backdrop" aria-hidden="true" onPointerDown={e => e.preventDefault()} />;

/**
 * The top of a panel: its name, since it no longer opens beside what was tapped, and a small x at the top right (user's
 * choice, 2026-11-18): the same as Annulla below, there for who looks up first.
 */
export function PanelHead({ title, onCancel }: { title: string; onCancel(): void }) {
  return (
    <div className="panel-head">
      <h3>{title}</h3>
      <button type="button" className="icon-choice small panel-close" aria-label="Chiudi" title="Chiudi (Esc)" onClick={onCancel}><Icon name="close" size={16} /></button>
    </div>
  );
}

/**
 * Esc cancels an open panel wherever the focus is (user's question, 2026-11-18): before, only from inside it. A small
 * menu open in the panel takes its Esc first and stops it.
 */
export function useEscape(open: boolean, onCancel: () => void): void {
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel.current(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
}
