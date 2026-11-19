import type { ReactNode } from 'react';

/**
 * Impostazioni in cards (user's choice, 2026-11-19, «molto brutto, la pagina impostazioni è un casino»): each a title
 * and rows, the label on the left and its control on the right, as a phone's settings. Before, one column of buttons,
 * boxes and grey lines with nothing grouping them.
 */
export function SettingsCard({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section role="group" aria-label={title} className={`settings-card${className ? ` ${className}` : ''}`}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/** One row: what it is, with a line under it if needed, and on the right what changes it or what it says. */
export function SettingRow({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}{hint && <span className="small muted">{hint}</span>}</span>
      {children !== undefined && <span className="setting-value">{children}</span>}
    </div>
  );
}

/** A real on/off switch (2026-11-19): the checkboxes of the first Avvisi looked like a form. */
export function Switch({ label, on, disabled, onChange }: { label: string; on: boolean; disabled?: boolean; onChange(on: boolean): void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} className="switch" disabled={disabled} onClick={() => onChange(!on)}>
      <span className="knob" />
    </button>
  );
}
