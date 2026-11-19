import { agendaSources } from '@attivita/core';
import type { AgendaSource } from '@attivita/core';
import { instantNow, localNow } from '../dates.js';
import { useWs } from '../workspace/useWorkspace.js';

/**
 * The groups with their activities as the agenda sees them now: an archived group is out, snoozed ones whose time has
 * come are back. Built in the core, as the server builds them for the alerts (2026-11-19).
 */
export function useAgendaSources(): AgendaSource[] {
  const ws = useWs();
  return agendaSources(ws.groups, ws.activities, localNow(), instantNow());
}
