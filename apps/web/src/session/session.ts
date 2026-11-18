import type { AccountId, Engine, GroupId } from '@attivita/core';
import type { OutboxStore } from '../offline/outbox.js';
import type { PrefsStore } from '../settings/prefsSync.js';
import type { TelegramStore } from '../telegram/store.js';

/** A Google project connected before that did not open again, and why. */
export interface Unreached { projectId: string; reason: 'signedOut' | 'failed' }

export interface Session {
  account: AccountId;
  /** Engine of the drafts and of the personal group. */
  primary: Engine;
  /** Every engine of this session, primary first. */
  engines: Engine[];
  personalGroupId: GroupId;
  outbox: OutboxStore;
  signOut(): Promise<void>;
  /** Where the account keeps the prefs that follow it across devices; absent, they stay in this browser (the demo). */
  prefs?: PrefsStore;
  /** The demo with sample data in memory: a band says so, and signing out leaves the demo. */
  demo?: true;
  /**
   * The Google projects connected before that could not be opened again (signed out, not verified, Firebase not
   * loaded): their groups are missing, and a band says so. Before 2026-11-18 they went without a word.
   * `signedOut`: no valid Google login for it in this browser, the band offers «Accedi di nuovo»; `failed`: any other
   * error, the band offers Riprova.
   */
  unreached?: Unreached[];
  /** The Telegram alerts' server side (2026-11-18); only on the central engine, absent in the demo. */
  telegram?: TelegramStore;
  addEngine(e: Engine): void;
}

/** What an opener returns: SessionHost adds the engine list that grows while the app runs. */
export type OpenedSession = Omit<Session, 'addEngine'>;

export type OpenSession = () => Promise<OpenedSession | null>;
