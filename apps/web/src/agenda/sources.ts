import { resumeIfDue } from '@attivita/core';
import type { AgendaSource } from '@attivita/core';
import { instantNow, localNow } from '../dates.js';
import { useWs } from '../workspace/useWorkspace.js';

/** The groups with their activities as the agenda sees them now: snoozed ones whose time has come are back. */
export function useAgendaSources(): AgendaSource[] {
  const ws = useWs();
  const now = localNow();
  // An archived group is out of the agenda: nobody works on it any more.
  return ws.groups.filter(g => !g.archived).map(group => ({
    group, activities: ws.activities.filter(a => a.groupId === group.id).map(a => resumeIfDue(a, now, instantNow())),
  }));
}
