import type { AccountId, Group } from '@attivita/core';
import { Icon } from '../shell/icons.js';
import { iconOf, useBarPrefs } from './barPrefs.js';

/** The icon the person chose for the group, or the group's initial when there is none. */
export function GroupIcon({ group, account }: { group: Group; account: AccountId }) {
  useBarPrefs();
  const icon = iconOf(account, group.id);
  return icon ? <Icon name={icon} /> : <span className="initial" aria-hidden="true">{group.name.charAt(0).toUpperCase()}</span>;
}
