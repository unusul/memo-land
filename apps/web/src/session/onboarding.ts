import { EngineUnavailableError } from '@attivita/core';
import type { AccountId, GroupId } from '@attivita/core';

export interface Identity {
  account: AccountId;
  personalGroupId: GroupId;
  /** True when the server could not be reached: the app opens anyway and captures into the outbox. */
  offline: boolean;
}

const isNetworkFailure = (e: unknown) => e instanceof EngineUnavailableError || e instanceof TypeError;

export function offlineIdentity(email: string): Identity {
  const account = email.toLowerCase();
  return { account, personalGroupId: `personal:${account}`, offline: true };
}

/**
 * Onboarding needs the server, but opening the app must not: on a network failure only, the identity
 * comes from the signed-in email, which is how the server names accounts and personal groups.
 */
export async function resolveOnboarding(email: string, onboard: () => Promise<{ account: AccountId; personalGroupId: GroupId }>): Promise<Identity> {
  try {
    const { account, personalGroupId } = await onboard();
    return { account, personalGroupId, offline: false };
  } catch (e) {
    if (!isNetworkFailure(e)) throw e;
    return offlineIdentity(email);
  }
}

export type Startup = { kind: 'session'; email: string } | { kind: 'offline'; email: string } | { kind: 'login' };

/**
 * Without network, or with the server down, an expired access token cannot be refreshed and the auth client
 * reports no session: the last signed-in account still opens the app, so capture keeps working.
 */
export function chooseStartup(s: { sessionEmail: string | null; cachedEmail: string | null; online: boolean; serverUnreachable: boolean }): Startup {
  if (s.sessionEmail) return { kind: 'session', email: s.sessionEmail };
  if ((!s.online || s.serverUnreachable) && s.cachedEmail) return { kind: 'offline', email: s.cachedEmail };
  return { kind: 'login' };
}

export const TIMED_OUT = Symbol('timed out');

/** Opening the app must stay fast: the server gets `ms` to answer, then the app opens without it. */
export function withinStartupWait<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return Promise.race([work, new Promise<typeof TIMED_OUT>(resolve => setTimeout(() => resolve(TIMED_OUT), ms))]);
}
