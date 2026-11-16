import { can as allowed, complete, reopenOccurrence, roleIn, skipOccurrence, undoTo } from '@attivita/core';
import type { Activity } from '@attivita/core';
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
 * The swipes of an agenda row. Towards the right Fatto, or «Togli fatta» on an occurrence already done; towards the left
 * «Salta» on one occurrence of a series, «Sposta la data» on a one-off activity (it opens with its date ready to change).
 * Each only where the detail offers it, for the same occurrence; Fatto and Salta can be taken back with Annulla.
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
    const save = async (next: Activity, text: string, undo: boolean) => {
      try {
        const saved = await ws.save(next);
        toast({ text, ...(undo ? { undo: () => { ws.save(undoTo(a, saved, instantNow())).catch(e => toast({ text: errorText(e) })); } } : {}) });
      } catch (e) {
        toast({ text: errorText(e) });
      }
    };
    const role = group ? roleIn(group, me) ?? 'guest' : 'owner';
    const dateProp = a.props.due !== undefined ? 'due' : a.props.schedule !== undefined ? 'schedule' : null;
    const movable = dateProp && !a.props.repeat && group && allowed(group, me, 'editActivity');
    const right: SwipeAction | undefined = can.includes('complete')
      ? { label: 'Fatto', icon: 'check', tone: 'done', run: () => void save(complete(a, me, occ?.key ?? localNow(), instantNow(), occ?.key), 'Fatta', true) }
      : can.includes('reopenOccurrence')
        ? { label: 'Togli fatta', icon: 'reopen', tone: 'done', run: () => void save(reopenOccurrence(a, occ!.key, me, instantNow()), 'Tolta la spunta', false) }
        : undefined;
    const left: SwipeAction | undefined = can.includes('skip')
      ? { label: 'Salta', icon: 'deadline', tone: 'later', run: () => void save(skipOccurrence(a, occ!.key, me, role, instantNow()), 'Saltata', true) }
      : movable ? { label: 'Sposta la data', icon: 'deadline', tone: 'later', run: () => onOpen({ activityId, form: dateProp }) } : undefined;
    return { ...(right ? { right } : {}), ...(left ? { left } : {}) };
  };
}
