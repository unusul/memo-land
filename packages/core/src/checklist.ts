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

const MAX_QUANTITY = 999;

/**
 * A number from 1 to 999 at the end of the text, after a space, is the quantity: «latte 3». A number alone, glued to
 * the word or out of range stays text.
 */
export function splitQuantity(text: string): { name: string; quantity: number | null } {
  const m = /^(.*\S)\s+([1-9]\d{0,2})$/.exec(text.trim());
  return m ? { name: m[1]!, quantity: Number(m[2]) } : { name: text.trim(), quantity: null };
}

const nameOf = (text: string) => splitQuantity(text).name;

/**
 * Adds an item. An open item with the same name (any case) is already there: a number adds to its quantity (no number
 * counts as one), no number changes nothing.
 */
export function addItem(a: Activity, text: string, _by: AccountId, now: Instant): Activity {
  const t = text.trim();
  if (t === '') fail('INVALID_INPUT', 'an item needs a text');
  const list = a.checklist ?? EMPTY;
  const { name, quantity } = splitQuantity(t);
  const open = list.items.find(i => !i.done && same(nameOf(i.text), name));
  if (open) return quantity === null ? a : withList(a, { ...list, items: list.items.map(i => (i === open ? { ...i, text: addQuantity(i.text, quantity) } : i)) }, now);
  const knownKey = Object.keys(list.known).find(k => same(k, name)) ?? name;
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

/** Changes an item's text, in place and with its tick; the suggestions follow the new text, not the old one. */
export function editItem(a: Activity, itemId: string, text: string, _by: AccountId, now: Instant): Activity {
  const t = text.trim();
  if (t === '') fail('INVALID_INPUT', 'an item needs a text');
  const list = a.checklist ?? fail('NOT_FOUND', 'no list');
  const item = list.items.find(i => i.id === itemId) ?? fail('NOT_FOUND', `item ${itemId}`);
  if (item.text === t) return a;
  return withList(a, {
    ...list, items: list.items.map(i => (i.id === itemId ? { ...i, text: t } : i)), known: moveKnown(list.known, item.text, t),
  }, now);
}

function addQuantity(text: string, more: number): string {
  const { name, quantity } = splitQuantity(text);
  return `${name} ${Math.min((quantity ?? 1) + more, MAX_QUANTITY)}`;
}

/** One use moves from the old name to the new one; a name left with no use is forgotten. The quantity is not a name. */
function moveKnown(known: Record<string, number>, fromText: string, toText: string): Record<string, number> {
  const from = nameOf(fromText);
  const to = nameOf(toText);
  if (same(from, to)) return known;
  const next = { ...known };
  const fromKey = Object.keys(next).find(k => same(k, from));
  if (fromKey !== undefined && --next[fromKey]! <= 0) delete next[fromKey];
  const toKey = Object.keys(next).find(k => same(k, to)) ?? to;
  next[toKey] = (next[toKey] ?? 0) + 1;
  return next;
}

/**
 * Moves an open item to `toIndex` among the open items (past the end is the end). Ticked items keep their slots: the
 * list shows them apart, and an item ticked off comes back where it was.
 */
export function moveItem(a: Activity, itemId: string, toIndex: number, _by: AccountId, now: Instant): Activity {
  const list = a.checklist ?? fail('NOT_FOUND', 'no list');
  const open = list.items.filter(i => !i.done);
  const from = open.findIndex(i => i.id === itemId);
  if (from < 0) fail('NOT_FOUND', `open item ${itemId}`);
  const to = Math.max(0, Math.min(toIndex, open.length - 1));
  if (to === from) return a;
  const order = [...open];
  order.splice(to, 0, ...order.splice(from, 1));
  let next = 0;
  return withList(a, { ...list, items: list.items.map(i => (i.done ? i : order[next++]!)) }, now);
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
    .filter(([t]) => t.toLocaleLowerCase('it').startsWith(p) && !list.items.some(i => !i.done && same(nameOf(i.text), t)))
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
