import { useEffect, useMemo, useRef, useState } from 'react';
import { useAgendaSources } from '../agenda/sources.js';
import { alertsOf, useBarPrefs } from '../groups/barPrefs.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { alertsFor } from './alerts.js';
import { refreshTelegram, useTelegramStatus } from './state.js';

/** A moment after the last change, once for a burst; again every half hour, as the week ahead moves on. */
const SEND_AFTER_MS = 3000;
const AGAIN_MS = 30 * 60_000;

/**
 * Hands the server the alerts of the next days whenever what they depend on changes (activities, groups, the choices
 * in the settings), while a chat is tied (user's choice, 2026-11-18, lite version). The same list is not sent twice.
 */
export function useTelegramQueue(): void {
  const { telegram, account } = useSession();
  const ws = useWs();
  const sources = useAgendaSources();
  const status = useTelegramStatus();
  const prefsVersion = useBarPrefs();
  const [tick, setTick] = useState(0);
  const sent = useRef<string | null>(null);

  useEffect(() => { if (telegram) void refreshTelegram(telegram); }, [telegram]);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), AGAIN_MS);
    return () => clearInterval(t);
  }, []);

  const linked = status?.linked === true;
  const alerts = useMemo(
    () => {
      if (!linked || !status) return [];
      const own = alertsOf(account);
      return alertsFor(sources, g => ws.engineOf(g)?.account ?? account, status, new Date(), id => own[id]);
    },
    // sources is new at each render; what it is made of is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [linked, status?.start, status?.end, ws.activities, ws.groups, tick, account, prefsVersion],
  );
  const body = JSON.stringify(alerts);

  useEffect(() => {
    if (!telegram || !linked || body === sent.current) return;
    const t = setTimeout(() => {
      telegram.replaceQueue(JSON.parse(body) as typeof alerts).then(() => { sent.current = body; }, () => undefined);
    }, SEND_AFTER_MS);
    return () => clearTimeout(t);
  }, [telegram, linked, body]);
}
