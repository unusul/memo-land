import { useEffect, useRef } from 'react';
import { useSession } from '../session/SessionContext.js';
import { refreshTelegram, useTelegramStatus } from './state.js';
import { useTelegramAlerts } from './useTelegramAlerts.js';

/** A moment after the last change, once for a burst. */
const SEND_AFTER_MS = 3000;

/**
 * Hands the server the alerts of the next days whenever what they depend on changes (activities, groups, the bells),
 * while a chat is tied (user's choice, 2026-11-18, lite version). The same list is not sent twice.
 */
export function useTelegramQueue(): void {
  const { telegram } = useSession();
  const status = useTelegramStatus();
  const alerts = useTelegramAlerts();
  const sent = useRef<string | null>(null);

  useEffect(() => { if (telegram) void refreshTelegram(telegram); }, [telegram]);

  const linked = status?.linked === true;
  const body = JSON.stringify(alerts.map(({ at, text }) => ({ at, text })));

  useEffect(() => {
    if (!telegram || !linked || body === sent.current) return;
    const t = setTimeout(() => {
      telegram.replaceQueue(JSON.parse(body) as Array<{ at: string; text: string }>).then(() => { sent.current = body; }, () => undefined);
    }, SEND_AFTER_MS);
    return () => clearTimeout(t);
  }, [telegram, linked, body]);
}
