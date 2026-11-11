import type { OpenTarget } from '../agenda/AgendaView.js';
import { KIND_LABEL } from '../labels.js';
import { useWs } from '../workspace/useWorkspace.js';
import { GroupList, groupName } from './GroupsView.js';

/** One group's page, reached from the menu: every open activity of the group, dated or not. */
export function GroupPage({ groupId, onOpen }: { groupId: string; onOpen(t: OpenTarget): void }) {
  const ws = useWs();
  const g = ws.groups.find(x => x.id === groupId);
  if (!g) return <p className="muted">{ws.loaded ? 'Questo gruppo non c\'è più o non ne fai più parte.' : 'Carico…'}</p>;
  const label = groupName(g);
  return (
    <section aria-labelledby="group-h" className="stack">
      <header className="row"><h2 id="group-h">{label}</h2><span className="pill">{KIND_LABEL[g.kind]}</span></header>
      <GroupList label={label} group={g} activities={ws.activities.filter(a => a.groupId === g.id && a.status === 'open')} onOpen={onOpen} />
    </section>
  );
}
