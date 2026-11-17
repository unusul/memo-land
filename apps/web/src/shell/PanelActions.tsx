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
