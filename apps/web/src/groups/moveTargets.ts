import { groupTypeOf, roleIn } from '@attivita/core';
import type { AccountId, Group, GroupId } from '@attivita/core';
import { orderSharedGroups } from './barPrefs.js';

/**
 * Where an activity can be moved, for the detail's menu and the drafts' swipe: not where it is, not where the person is
 * a guest, not into a list group (it would not be seen there), not into an archived group (read only until its owner
 * reopens it). Personale first, then the others in the order of Noi (user's choice, 2026-11-17), not as the engines
 * give them.
 */
export function moveTargets(groups: readonly Group[], me: AccountId, from: GroupId | null): Group[] {
  const ordered = [...groups.filter(g => g.kind === 'personal'), ...orderSharedGroups([...groups], me)];
  return ordered.filter(g => g.id !== from && !g.archived && roleIn(g, me) !== 'guest' && groupTypeOf(g) !== 'list');
}
