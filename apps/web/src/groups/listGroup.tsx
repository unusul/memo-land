import { useEffect } from 'react';
import { can, groupTypeOf, listActivityId, newActivity } from '@attivita/core';
import type { AccountId, Activity, Group } from '@attivita/core';
import { ActivityDetail } from '../activity/ActivityDetail.js';
import { instantNow } from '../dates.js';
import { useWs } from '../workspace/useWorkspace.js';

/** What waits in a group: the open activities, or for a list the items still to tick; with the words to read it out. */
export function waitingIn(g: Group, activities: Activity[]): { n: number; words: string } {
  if (groupTypeOf(g) === 'list') {
    const n = activities.find(a => a.id === listActivityId(g))?.checklist?.items.filter(i => !i.done).length ?? 0;
    return { n, words: `${n} da spuntare` };
  }
  const n = activities.filter(a => a.groupId === g.id && a.status === 'open').length;
  return { n, words: `${n} ${n === 1 ? 'aperta' : 'aperte'}` };
}

/**
 * A list group's page: the detail of its one activity, list on top and every property below (a due date, who does it,
 * a repeat that starts the list again). The activity is made the first time someone who edits the group opens it; the
 * group's other activities (it was a group of activities before) are counted, not shown.
 */
export function ListGroupView({ group: g, account }: { group: Group; account: AccountId }) {
  const ws = useWs();
  const id = listActivityId(g);
  const list = ws.activities.find(a => a.id === id);
  const mayEdit = !g.archived && can(g, account, 'editActivity');
  useEffect(() => {
    if (!ws.loaded || list || !mayEdit) return;
    // Two members opening it at once: the second save finds it made, and a reload shows it.
    ws.save(newActivity({ id, accountId: account, title: g.name, groupId: g.id }, instantNow())).catch(() => ws.reload());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.loaded, list === undefined, mayEdit, id]);
  const hidden = ws.activities.filter(a => a.groupId === g.id && a.id !== id && a.status === 'open').length;
  return (
    <div className="stack">
      {list ? <ActivityDetail key={id} activityId={id} asGroupList onClose={() => undefined} />
        : <p className="muted">{mayEdit ? 'Preparo la lista…' : 'La lista è ancora vuota.'}</p>}
      {hidden > 0 && <p className="muted small">Il gruppo ha anche {hidden === 1 ? '1 attività che nella lista non si vede' : `${hidden} attività che nella lista non si vedono`}: le ritrovi rimettendo il tipo Attività in Noi.</p>}
    </div>
  );
}
