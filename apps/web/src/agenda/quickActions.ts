import { can as allowed, complete, undoTo } from '@attivita/core';
import { availableActions } from '../activity/actions.js';
import { occurrenceAt } from '../activity/occurrence.js';
import { instantNow, localNow } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import type { SwipeAction } from '../shell/SwipeRow.js';
import { useToast } from '../shell/toast.js';
import { useWs } from '../workspace/useWorkspace.js';
import type { OpenTarget } from './AgendaView.js';

/**
 * The swipes of an agenda row: towards the right Fatto, towards the left «Sposta la data» (the activity opens with its
 * date ready to change). Fatto only where the detail offers it, for the same occurrence, and it can be taken back with
 * Annulla; the date only on a one-off activity the person may edit (a series is not moved from one of its rows).
 */
export function useQuickActions(onOpen: (t: OpenTarget) => void) {
  const ws = useWs();
  const { account } = useSession();
  const toast = useToast();
  return (activityId: string, key?: string): { right?: SwipeAction; left?: SwipeAction } => {
    const a = ws.activities.find(x => x.id === activityId);
    if (!a || a.groupId === null) return {};
    const group = ws.groups.find(g => g.id === a.groupId) ?? null;
    if (group?.archived) return {};
    const me = ws.engineOf(a.groupId)?.account ?? account;
    const occ = occurrenceAt(a, key);
    const can = availableActions(a, occ, group, me);
    const done = async () => {
      try {
        const saved = await ws.save(complete(a, me, occ?.key ?? localNow(), instantNow(), occ?.key));
        toast({ text: 'Fatta', undo: () => { ws.save(undoTo(a, saved, instantNow())).catch(e => toast({ text: errorText(e) })); } });
      } catch (e) {
        toast({ text: errorText(e) });
      }
    };
    const dateProp = a.props.due !== undefined ? 'due' : a.props.schedule !== undefined ? 'schedule' : null;
    const movable = dateProp && !a.props.repeat && group && allowed(group, me, 'editActivity');
    return {
      ...(can.includes('complete') ? { right: { label: 'Fatto', icon: 'check', tone: 'done', run: () => void done() } as SwipeAction } : {}),
      ...(movable ? { left: { label: 'Sposta la data', icon: 'deadline', tone: 'later', run: () => onOpen({ activityId, form: dateProp }) } as SwipeAction } : {}),
    };
  };
}
