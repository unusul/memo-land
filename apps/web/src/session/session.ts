import type { AccountId, Engine, GroupId } from '@attivita/core';
import type { OutboxStore } from '../offline/outbox.js';

export interface Session {
  account: AccountId;
  engine: Engine;
  personalGroupId: GroupId;
  outbox: OutboxStore;
  signOut(): Promise<void>;
}

export type OpenSession = () => Promise<Session | null>;
