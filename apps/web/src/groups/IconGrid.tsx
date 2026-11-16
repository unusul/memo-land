import type { ReactNode } from 'react';
import { GROUP_ICON_SECTIONS, Icon } from '../shell/icons.js';
import type { GroupIconName } from '../shell/icons.js';

/** The icons to choose from, by section, as a group's page shows them; `first` goes before the sections (a group's initial). */
export function IconGrid({ label, onChoose, first }: { label: string; onChoose(icon: GroupIconName): void; first?: ReactNode }) {
  return (
    <div className="icon-grid" role="group" aria-label={label}>
      {first && <div className="icon-section">{first}</div>}
      {GROUP_ICON_SECTIONS.map(sec => (
        <div key={sec.title} className="icon-section" role="group" aria-label={sec.title}>
          <p className="label">{sec.title}</p>
          <div className="icon-row">
            {sec.icons.map(i => <button key={i.name} className="icon-choice" aria-label={i.label} title={i.label} onClick={() => onChoose(i.name)}><Icon name={i.name} /></button>)}
          </div>
        </div>
      ))}
    </div>
  );
}

const NAMES: ReadonlySet<string> = new Set(GROUP_ICON_SECTIONS.flatMap(s => s.icons.map(i => i.name)));

/** A stored icon name, when the app still has that icon; otherwise the fallback. */
export const iconOr = (name: string | undefined, fallback: GroupIconName): GroupIconName => (name !== undefined && NAMES.has(name) ? name as GroupIconName : fallback);
