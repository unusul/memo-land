import type { AccountId } from '@attivita/core';

/** Choices a person made (snooze, repeat, groups opened), counted per account in this browser; the most used come first. */
export type ChoiceKind = 'snooze' | 'repeat' | 'group';
type Counts = Record<string, number>;

const key = (account: AccountId, kind: ChoiceKind) => `attivita:choices:${kind}:${account}`;

function load(account: AccountId, kind: ChoiceKind): Counts {
  try {
    return JSON.parse(localStorage.getItem(key(account, kind)) ?? '{}') as Counts;
  } catch {
    return {};
  }
}

export function topChoices(account: AccountId, kind: ChoiceKind, n = 3): string[] {
  return Object.entries(load(account, kind)).sort((x, y) => y[1] - x[1]).slice(0, n).map(([value]) => value);
}

export function noteChoice(account: AccountId, kind: ChoiceKind, value: string): void {
  const counts = load(account, kind);
  counts[value] = (counts[value] ?? 0) + 1;
  try { localStorage.setItem(key(account, kind), JSON.stringify(counts)); } catch { /* storage unavailable: no shortcuts */ }
}
