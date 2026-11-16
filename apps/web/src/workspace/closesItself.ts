import { useEffect, useState } from 'react';
import { closeByItself, roleIn } from '@attivita/core';
import { instantNow, localNow } from '../dates.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from './useWorkspace.js';

/** While the app stays open, the times that end meanwhile are closed too. */
const TICK_MS = 60_000;

/**
 * «Si chiude da sola» (2026-11-16): the activities switched on are marked done by themselves at the end of their time.
 * There is no server: whoever opens the app after that time, and may change the activity, does it, as the linked waits
 * do. Each version of an activity is tried once per minute at most.
 */
export function useClosesItself(): void {
  const ws = useWs();
  const { account } = useSession();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);
  const switched = [...ws.activities, ...ws.drafts].filter(a => a.closesItself && a.status === 'open');
  const key = switched.map(a => `${a.id}@${a.version}`).join('|');
  useEffect(() => {
    for (const a of switched) {
      const group = a.groupId === null ? null : ws.groups.find(g => g.id === a.groupId);
      if (group === undefined || group?.archived) continue;
      const me = (a.groupId === null ? undefined : ws.engineOf(a.groupId)?.account) ?? account;
      if (group && (roleIn(group, me) ?? 'guest') === 'guest') continue;
      const next = closeByItself(a, localNow(), me, instantNow());
      if (next !== a) ws.save(next).catch(() => undefined);
    }
    // By the ids and versions switched on, and once a minute: every reload brings new objects for the same activities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
}
