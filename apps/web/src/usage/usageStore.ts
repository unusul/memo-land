import { recordUse } from '@attivita/core';
import type { AccountId, PropKey, UsageStats } from '@attivita/core';

/** Per-account usage counts in this browser; moves to the person's engine data in a later plan. */
const key = (account: AccountId) => `attivita:usage:${account}`;

export function loadUsage(account: AccountId): UsageStats {
  try {
    return JSON.parse(localStorage.getItem(key(account)) ?? '{}') as UsageStats;
  } catch {
    return {};
  }
}

export function seedUsage(account: AccountId, stats: UsageStats): void {
  try { localStorage.setItem(key(account), JSON.stringify(stats)); } catch { /* storage unavailable: ranking falls back to defaults */ }
}

export function noteUse(account: AccountId, prop: PropKey): UsageStats {
  const next = recordUse(loadUsage(account), prop);
  seedUsage(account, next);
  return next;
}
