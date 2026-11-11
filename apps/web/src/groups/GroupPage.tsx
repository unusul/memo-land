import type { OpenTarget } from '../agenda/AgendaView.js';
import { KIND_LABEL } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { GroupName } from './GroupName.js';
import { can, groupTypeOf } from '@attivita/core';
import { ListGroupView } from './listGroup.js';
import { ManagedBy } from './ManagedBy.js';
import { ClosedLists, GroupList, groupName } from './GroupsView.js';

/** One group's page, reached from the menu: every open activity of the group, dated or not; a list group shows its list. */
export function GroupPage({ groupId, onOpen }: { groupId: string; onOpen(t: OpenTarget): void }) {
  const ws = useWs();
  const session = useSession();
  const g = ws.groups.find(x => x.id === groupId);
  if (!g) return <p className="muted">{ws.loaded ? 'Questo gruppo non c\'è più o non ne fai più parte.' : 'Carico…'}</p>;
  const label = groupName(g);
  const me = ws.engineOf(g.id)?.account ?? session.account;
  return (
    <section aria-labelledby="group-h" className="stack">
      <header className="row" id="group-h">
        <GroupName group={g} label={label} account={me} level="h2" />
        <span className="pills"><span className="pill">{KIND_LABEL[g.kind]}</span><ManagedBy groupId={g.id} /></span>
      </header>
      {groupTypeOf(g) === 'list' ? <ListGroupView group={g} account={me} /> : <>
        <GroupList label={label} group={g} activities={ws.activities.filter(a => a.groupId === g.id && a.status === 'open')} onOpen={onOpen} />
        <ClosedLists activities={ws.activities.filter(a => a.groupId === g.id && a.status !== 'open')} onOpen={onOpen} canReopen={() => can(g, me, 'editActivity')} />
      </>}
    </section>
  );
}
