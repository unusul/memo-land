import type { AccountId, Group } from '@attivita/core';
import { noteChoice, topChoices } from '../usage/choicesStore.js';

/** The personal group first, then the groups opened most often in this browser, then the others by name. */
export function orderGroups(groups: Group[], account: AccountId): Group[] {
  const used = topChoices(account, 'group', Number.MAX_SAFE_INTEGER);
  const rank = (g: Group) => (g.kind === 'personal' ? -1 : used.includes(g.id) ? used.indexOf(g.id) : used.length);
  return [...groups].sort((x, y) => rank(x) - rank(y) || x.name.localeCompare(y.name, 'it'));
}

export const noteGroupOpened = (account: AccountId, groupId: string) => noteChoice(account, 'group', groupId);
