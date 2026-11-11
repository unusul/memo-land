import { fail } from './errors.js';
import type { AccountId, Activity, Checklist, Instant } from './types.js';

/*
 * The list inside an activity. Ticking and adding items leave no history entry: a shopping list would bury the
 * history that matters (assignments, completions); the list itself shows its state.
 */

const EMPTY: Checklist = { items: [], fixed: false, known: {}, seq: 0 };
const same = (x: string, y: string) => x.toLocaleLowerCase('it') === y.toLocaleLowerCase('it');

function withList(a: Activity, checklist: Checklist, now: Instant): Activity {
  return { ...a, checklist, updatedAt: now };
}

/** Adds an item; an open item with the same text (any case) is already there, so nothing changes. */
export function addItem(a: Activity, text: string, _by: AccountId, now: Instant): Activity {
  const t = text.trim();
  if (t === '') fail('INVALID_INPUT', 'an item needs a text');
  const list = a.checklist ?? EMPTY;
  if (list.items.some(i => !i.done && same(i.text, t))) return a;
  const knownKey = Object.keys(list.known).find(k => same(k, t)) ?? t;
  const seq = list.seq + 1;
  return withList(a, {
    ...list, seq, items: [...list.items, { id: `i${seq}`, text: t, done: false }],
    known: { ...list.known, [knownKey]: (list.known[knownKey] ?? 0) + 1 },
  }, now);
}

export function toggleItem(a: Activity, itemId: string, _by: AccountId, now: Instant): Activity {
  const list = a.checklist ?? fail('NOT_FOUND', 'no list');
  if (!list.items.some(i => i.id === itemId)) fail('NOT_FOUND', `item ${itemId}`);
  return withList(a, { ...list, items: list.items.map(i => (i.id === itemId ? { ...i, done: !i.done } : i)) }, now);
}

export function removeItem(a: Activity, itemId: string, _by: AccountId, now: Instant): Activity {
  const list = a.checklist ?? fail('NOT_FOUND', 'no list');
  return withList(a, { ...list, items: list.items.filter(i => i.id !== itemId) }, now);
}

export function setListFixed(a: Activity, fixed: boolean, _by: AccountId, now: Instant): Activity {
  return withList(a, { ...(a.checklist ?? EMPTY), fixed }, now);
}

/** Texts the list has seen that start with `prefix` (any case) and are not open in it now; most added first. */
export function suggestItems(a: Activity, prefix: string, limit = 6): string[] {
  const list = a.checklist;
  if (!list) return [];
  const p = prefix.trim().toLocaleLowerCase('it');
  return Object.entries(list.known)
    .filter(([t]) => t.toLocaleLowerCase('it').startsWith(p) && !list.items.some(i => !i.done && same(i.text, t)))
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([t]) => t);
}

/** After a recurring activity is completed: a fixed list is unticked, any other loses its ticked items. */
export function resetForNextRound(a: Activity): Activity {
  const list = a.checklist;
  if (!list) return a;
  const items = list.fixed ? list.items.map(i => ({ ...i, done: false })) : list.items.filter(i => !i.done);
  return { ...a, checklist: { ...list, items } };
}
