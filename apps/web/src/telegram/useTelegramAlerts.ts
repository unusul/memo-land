import { useEffect, useMemo, useState } from 'react';
import { useAgendaSources } from '../agenda/sources.js';
import { alertsOf, useBarPrefs } from '../groups/barPrefs.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { NO_GENERAL, alertEntries } from './alerts.js';
import type { AlertEntry } from './alerts.js';
import { useTelegramStatus } from './state.js';

/** The week ahead moves on: the alerts are computed again this often even without a change. */
const AGAIN_MS = 30 * 60_000;

/**
 * The person's alerts of the next days, while a chat is tied: those set by hand with the bell, nothing else (user's
 * choice, 2026-11-19). What the server is handed and what Impostazioni lists, so the two are always the same.
 */
export function useTelegramAlerts(): AlertEntry[] {
  const { account } = useSession();
  const ws = useWs();
  const sources = useAgendaSources();
  const status = useTelegramStatus();
  const prefsVersion = useBarPrefs();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), AGAIN_MS);
    return () => clearInterval(t);
  }, []);
  const linked = status?.linked === true;
  return useMemo(
    () => {
      if (!linked) return [];
      const own = alertsOf(account);
      return alertEntries(sources, g => ws.engineOf(g)?.account ?? account, NO_GENERAL, new Date(), id => own[id]);
    },
    // sources is new at each render; what it is made of is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linked, ws.activities, ws.groups, tick, account, prefsVersion],
  );
}
