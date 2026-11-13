import type { AccountId, Engine, GroupId } from '@attivita/core';
import type { OutboxStore } from '../offline/outbox.js';

export interface Session {
  account: AccountId;
  /** Engine of the drafts and of the personal group. */
  primary: Engine;
  /** Every engine of this session, primary first. */
  engines: Engine[];
  personalGroupId: GroupId;
  outbox: OutboxStore;
  signOut(): Promise<void>;
  /** The demo with sample data in memory: a band says so, and signing out leaves the demo. */
  demo?: true;
  addEngine(e: Engine): void;
}

/** What an opener returns: SessionHost adds the engine list that grows while the app runs. */
export type OpenedSession = Omit<Session, 'addEngine'>;

export type OpenSession = () => Promise<OpenedSession | null>;
