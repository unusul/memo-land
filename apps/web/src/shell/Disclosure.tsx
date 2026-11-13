import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './icons.js';

/**
 * A row that opens and closes what is under it, with an arrow that turns down when open, as in a notes app. It starts
 * closed each time it is shown: the ticked items of a list, the history of an activity.
 */
export function Disclosure({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="disclosure">
      <button type="button" className="disclosure-row" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        <Icon name="chevron" size={18} />
        {label}
      </button>
      {open && <div id={id}>{children}</div>}
    </div>
  );
}
