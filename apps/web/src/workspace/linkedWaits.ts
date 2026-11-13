import { useEffect, useRef } from 'react';
import { can, markConditionMet, roleIn, waitingOnDone } from '@attivita/core';
import { instantNow } from '../dates.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from './useWorkspace.js';

/**
 * An activity waiting for another one comes back by itself when that one is done: whoever sees both and may mark the
 * condition met does it, once per opening of the app. Nobody has to remember to come back and press «Segna avverata».
 */
export function useLinkedWaits(): void {
  const ws = useWs();
  const { account } = useSession();
  const tried = useRef(new Set<string>());
  const ready = waitingOnDone([...ws.activities, ...ws.drafts]).filter(a => !tried.current.has(a.id));
  const key = ready.map(a => a.id).join('|');
  useEffect(() => {
    for (const a of ready) {
      tried.current.add(a.id);
      const group = a.groupId === null ? null : ws.groups.find(g => g.id === a.groupId);
      if (group === undefined) continue;
      const me = (a.groupId === null ? undefined : ws.engineOf(a.groupId)?.account) ?? account;
      const role = group ? roleIn(group, me) : 'owner';
      if (!role || role === 'guest' || (group && !can(group, me, 'markConditionMet'))) continue;
      ws.save(markConditionMet(a, me, role, instantNow())).catch(() => undefined);
    }
    // By the ids ready: every reload brings new objects for the same activities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}
