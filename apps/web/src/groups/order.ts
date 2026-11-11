import type { AccountId } from '@attivita/core';
import { noteChoice } from '../usage/choicesStore.js';

export const noteGroupOpened = (account: AccountId, groupId: string) => noteChoice(account, 'group', groupId);
