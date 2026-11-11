import { useEffect, useState } from 'react';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { DraftsView } from '../drafts/DraftsView.js';
import { ClosedLists, GroupList, groupName } from '../groups/GroupsView.js';
import { errorCodeText } from '../labels.js';
import type { OutboxEntry } from '../offline/outbox.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

/** What is only the person's: drafts to sort, the personal group's activities, captures still in the outbox. */
export function MeView({ onOpen = () => undefined }: { onOpen?(t: OpenTarget): void } = {}) {
  const { account, outbox } = useSession();
  const ws = useWs();
  const [queue, setQueue] = useState<OutboxEntry[] | null>(null);

  useEffect(() => { outbox.list(account).then(setQueue).catch(() => setQueue(null)); }, [account, outbox, ws.drafts]);
  const waiting = queue?.filter(e => !e.error).length ?? 0;
  const refused = queue?.filter(e => e.error) ?? [];
  const personal = ws.groups.filter(g => g.kind === 'personal');

  return (
    <section aria-labelledby="me-h" className="stack">
      <h2 id="me-h">Io</h2>
      <DraftsView onOpen={onOpen} />
      {personal.map(g => (
        <div key={g.id} className="stack">
          <h3>{groupName(g)}</h3>
          <GroupList label={groupName(g)} group={g} activities={ws.activities.filter(a => a.groupId === g.id && a.status === 'open')} onOpen={onOpen} />
        </div>
      ))}
      <ClosedLists onOpen={onOpen} canReopen={a => a.accountId === account || personal.some(g => g.id === a.groupId)}
        activities={[...ws.drafts.filter(d => d.status !== 'open'), ...ws.activities.filter(a => a.status !== 'open' && personal.some(g => g.id === a.groupId))]} />
      {waiting > 0 && <p>{waiting === 1 ? '1 bozza in attesa di rete' : `${waiting} bozze in attesa di rete`}: partiranno appena torna la connessione.</p>}
      {refused.length > 0 && (
        <div className="attention">
          <h3>Non accettate dal server</h3>
          <ul className="items" aria-label="Non accettate dal server">
            {refused.map(e => (
              <li key={e.id} className="item">
                <span className="bar" style={{ background: 'var(--bad)' }} /><span><span className="t">{e.activity.title}</span><br /><span className="meta">{errorCodeText(e.error!)}</span></span><span />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
