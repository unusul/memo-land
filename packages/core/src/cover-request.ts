import { fail } from './errors.js';
import { isOccurrence } from './occurrences.js';
import { touch } from './props.js';
import type { AccountId, Activity, CoverAsk, Instant, OccurrenceKey, OccurrenceOverride, Role } from './types.js';

/*
 * «Copri tu questa» (user's choices, 2026-11-26): who has one time of a series asks a member of the group to cover it.
 * Until the other accepts, the time stays the asker's. Rifiuta takes an optional reason, and the asker sees it and may
 * ask someone else; the asker may withdraw a request nobody answered. Accetta gives the time as «Copro io questa» does.
 * Before, a time could only be taken by whoever wanted it.
 */

/** Who has a time: whoever covers it, else the series' assignee. */
export function holderOf(a: Activity, key: OccurrenceKey): AccountId | undefined {
  return a.overrides[key]?.assignee ?? a.props.assignment?.assignee;
}

/** The request on a time, if any. */
export const coverAskOf = (a: Activity, key: OccurrenceKey): CoverAsk | undefined => a.overrides[key]?.asked;

function withOverride(a: Activity, key: OccurrenceKey, change: (o: OccurrenceOverride) => OccurrenceOverride): Activity {
  const next = change(a.overrides[key] ?? {});
  const { [key]: _old, ...others } = a.overrides;
  return { ...a, overrides: Object.keys(next).length > 0 ? { ...others, [key]: next } : others };
}

const withoutAsk = ({ asked: _gone, ...o }: OccurrenceOverride): OccurrenceOverride => o;

/** Asks `to` to cover the time; a request already there (refused or not) is replaced. */
export function askCover(a: Activity, key: OccurrenceKey, to: AccountId, by: AccountId, byRole: Role, toRole: Role | undefined, now: Instant): Activity {
  if (byRole === 'guest' || toRole === undefined || toRole === 'guest') fail('FORBIDDEN', 'only members ask and are asked');
  if (!isOccurrence(a, key)) fail('INVALID_INPUT', `"${key}" is not an occurrence of this activity`);
  if (holderOf(a, key) !== by) fail('FORBIDDEN', 'only who has the time asks to cover it');
  if (to === by) fail('INVALID_INPUT', 'a request goes to someone else');
  return touch(withOverride(a, key, o => ({ ...o, asked: { to, by } })), { kind: 'coverAsked', detail: { key, to } }, by, now);
}

/** The person asked takes the time, as «Copro io questa»; the request goes. */
export function acceptCover(a: Activity, key: OccurrenceKey, by: AccountId, now: Instant): Activity {
  const ask = openAskTo(a, key, by);
  return touch(withOverride(a, key, o => ({ ...withoutAsk(o), assignee: by, takenBy: by })), { kind: 'coverAccepted', detail: { key, for: ask.by } }, by, now);
}

/** The person asked says no, with a reason or not; the time stays the asker's, who sees it. */
export function refuseCover(a: Activity, key: OccurrenceKey, by: AccountId, reason: string, now: Instant): Activity {
  const ask = openAskTo(a, key, by);
  const why = reason.trim();
  return touch(withOverride(a, key, o => ({ ...o, asked: { ...ask, refused: true, ...(why ? { reason: why } : {}) } })),
    { kind: 'coverRefused', detail: { key, ...(why ? { reason: why } : {}) } }, by, now);
}

/** The asker takes the request back: before an answer, or to clear a refusal. */
export function withdrawCover(a: Activity, key: OccurrenceKey, by: AccountId, now: Instant): Activity {
  const ask = coverAskOf(a, key) ?? fail('INVALID_STATE', 'no request on this time');
  if (ask.by !== by) fail('FORBIDDEN', 'only who asked takes the request back');
  return touch(withOverride(a, key, withoutAsk), { kind: 'coverWithdrawn', detail: { key } }, by, now);
}

function openAskTo(a: Activity, key: OccurrenceKey, me: AccountId): CoverAsk {
  const ask = coverAskOf(a, key);
  if (!ask || ask.refused) fail('INVALID_STATE', 'no request waiting on this time');
  if (ask.to !== me) fail('FORBIDDEN', 'the request is for someone else');
  return ask;
}
