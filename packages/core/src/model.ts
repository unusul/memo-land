import { splitQuantity } from './checklist.js';
import { fail } from './errors.js';
import { newActivity } from './shape.js';
import { SUPERMARKET_ITEMS, SUPERMARKET_SECTIONS } from './supermarket.js';
import type { AccountId, Activity, ActivityId, GroupId, Instant, ListModel } from './types.js';

export { SUPERMARKET_ITEMS, SUPERMARKET_SECTIONS } from './supermarket.js';

/*
 * List models (user's choices, 2026-11-16). A model is a hidden activity of the group it belongs to: its members see it
 * and change it in Noi, and any list of theirs can use it. It holds an icon, the sections in order and the items placed
 * in them; a list using it is sorted section by section on request, the unknown items with Altro. The list itself
 * shows only its items. Like the list, model changes leave no history entry.
 */

/** The section that always stays: it takes the unknown items and those of a section taken away. */
export const OTHER_SECTION = 'altro';

export const isModel = (a: Activity): boolean => a.model !== undefined;

/**
 * One word without the endings that make singular and plural: «zucchina», «zucchine» → «zucchin»; «arancia», «arance» →
 * «aranc»; «funghi», «fungo» → «fung»; «olio», «oli» → «ol». Only the last vowel goes: stripping them all made «cacao»
 * and «cachi» the same word.
 */
function stem(word: string): string {
  if (word.length <= 2) return word;
  let w = word.length > 3 && word.endsWith('io') ? word.slice(0, -2) : word.replace(/[aeiou]$/, '');
  if (/[cgh]i$/.test(w)) w = w.slice(0, -1);
  return /[cg]h$/.test(w) ? w.slice(0, -1) : w;
}

const wordsOf = (text: string): string[] => splitQuantity(text).name
  .toLocaleLowerCase('it').normalize('NFD').replace(/\p{M}/gu, '')
  .split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);

/** What an item is known by: no case, accents or quantity, singular or plural alike. */
export const itemKey = (text: string): string => wordsOf(text).join(' ');

/** A new model in `groupId`: «Vuoto» has only Altro, «Supermercato (pronto)» the user's sections and the ready items. */
export function newModel(input: { id: ActivityId; groupId: GroupId; accountId: AccountId; name: string; ready: boolean }, now: Instant): Activity {
  const name = input.name.trim();
  if (name === '') fail('INVALID_INPUT', 'a model needs a name');
  const items: ListModel['items'] = {};
  if (input.ready) {
    for (const [section, names] of Object.entries(SUPERMARKET_ITEMS)) for (const n of names) items[itemKey(n)] = { name: n, section };
  }
  const model: ListModel = {
    icon: input.ready ? 'shopping' : 'documents',
    sections: input.ready ? SUPERMARKET_SECTIONS.map(s => ({ ...s })) : [{ id: OTHER_SECTION, name: 'Altro' }],
    items, seq: 0,
  };
  return { ...newActivity({ id: input.id, accountId: input.accountId, title: name, groupId: input.groupId }, now), model };
}

/**
 * The section of an item in a model, or undefined when the model does not know it. Without the exact name, the longest
 * known name the text starts with: «latte di soia» is not «latte». A section taken away hands its items to Altro.
 */
export function sectionOf(model: ListModel, text: string): string | undefined {
  const words = wordsOf(text);
  for (let n = words.length; n > 0; n--) {
    const found = model.items[words.slice(0, n).join(' ')];
    if (found) return model.sections.some(s => s.id === found.section) ? found.section : OTHER_SECTION;
  }
  return undefined;
}

/** Which model the list is sorted by; null for none. */
export function setListModel(list: Activity, modelId: ActivityId | null, _by: AccountId, now: Instant): Activity {
  const { model: _old, ...rest } = list.checklist ?? { items: [], fixed: false, known: {}, seq: 0 };
  return { ...list, checklist: modelId === null ? rest : { ...rest, model: modelId }, updatedAt: now };
}

/**
 * The items to do in the model's sections order, the unknown ones with Altro; within a section they keep their order.
 * Ticked items keep their slots, as with the handle. Already in order: the same activity.
 */
export function sortBySection(list: Activity, model: ListModel, _by: AccountId, now: Instant): Activity {
  const checklist = list.checklist ?? fail('NOT_FOUND', 'no list');
  const rank = (text: string) => model.sections.findIndex(s => s.id === (sectionOf(model, text) ?? OTHER_SECTION));
  const open = checklist.items.filter(i => !i.done);
  const sorted = open.map((item, k) => ({ item, k, r: rank(item.text) })).sort((x, y) => x.r - y.r || x.k - y.k).map(x => x.item);
  if (sorted.every((item, k) => item === open[k])) return list;
  let next = 0;
  return { ...list, checklist: { ...checklist, items: checklist.items.map(i => (i.done ? i : sorted[next++]!)) }, updatedAt: now };
}

const modelOf = (a: Activity): ListModel => a.model ?? fail('NOT_FOUND', 'not a list model');
const withModel = (a: Activity, model: ListModel, now: Instant): Activity => ({ ...a, model, updatedAt: now });
const sectionIn = (m: ListModel, id: string) => m.sections.find(s => s.id === id) ?? fail('NOT_FOUND', `section ${id}`);

function checkName(m: ListModel, name: string, except?: string): string {
  const n = name.trim();
  if (n === '') fail('INVALID_INPUT', 'a section needs a name');
  if (m.sections.some(s => s.id !== except && s.name.toLocaleLowerCase('it') === n.toLocaleLowerCase('it'))) fail('INVALID_INPUT', `section ${n} exists`);
  return n;
}

export function renameModel(a: Activity, name: string, _by: AccountId, now: Instant): Activity {
  modelOf(a);
  const n = name.trim();
  if (n === '') fail('INVALID_INPUT', 'a model needs a name');
  return n === a.title ? a : { ...a, title: n, updatedAt: now };
}

export function setModelIcon(a: Activity, icon: string, _by: AccountId, now: Instant): Activity {
  return withModel(a, { ...modelOf(a), icon }, now);
}

/** A new section goes just before Altro. */
export function addSection(a: Activity, name: string, _by: AccountId, now: Instant): Activity {
  const m = modelOf(a);
  const section = { id: `s${m.seq + 1}`, name: checkName(m, name) };
  const at = m.sections.findIndex(s => s.id === OTHER_SECTION);
  const sections = [...m.sections];
  sections.splice(at < 0 ? sections.length : at, 0, section);
  return withModel(a, { ...m, sections, seq: m.seq + 1 }, now);
}

export function renameSection(a: Activity, id: string, name: string, _by: AccountId, now: Instant): Activity {
  const m = modelOf(a);
  sectionIn(m, id);
  const n = checkName(m, name, id);
  return withModel(a, { ...m, sections: m.sections.map(s => (s.id === id ? { ...s, name: n } : s)) }, now);
}

/** Moves a section to `toIndex` (past the end is the end): the order of the walk through the shop. */
export function moveSection(a: Activity, id: string, toIndex: number, _by: AccountId, now: Instant): Activity {
  const m = modelOf(a);
  const from = m.sections.findIndex(s => s.id === id);
  if (from < 0) fail('NOT_FOUND', `section ${id}`);
  const to = Math.max(0, Math.min(toIndex, m.sections.length - 1));
  if (to === from) return a;
  const sections = [...m.sections];
  sections.splice(to, 0, ...sections.splice(from, 1));
  return withModel(a, { ...m, sections }, now);
}

/** Its items go to Altro; Altro itself always stays. */
export function removeSection(a: Activity, id: string, _by: AccountId, now: Instant): Activity {
  if (id === OTHER_SECTION) fail('INVALID_INPUT', 'Altro stays');
  const m = modelOf(a);
  sectionIn(m, id);
  const items = Object.fromEntries(Object.entries(m.items).map(([k, it]) => [k, it.section === id ? { ...it, section: OTHER_SECTION } : it]));
  return withModel(a, { ...m, sections: m.sections.filter(s => s.id !== id), items }, now);
}

/** Adds an item to a section, or moves it there when the model already knows it (singular or plural alike). */
export function placeItem(a: Activity, text: string, sectionId: string, _by: AccountId, now: Instant): Activity {
  const m = modelOf(a);
  sectionIn(m, sectionId);
  const name = splitQuantity(text).name;
  const key = itemKey(name);
  if (key === '') fail('INVALID_INPUT', 'an item needs a name');
  const known = m.items[key];
  return withModel(a, { ...m, items: { ...m.items, [key]: { name: known?.name ?? name, section: sectionId } } }, now);
}

/**
 * Where an item the model does not know by its own name would go: the section of the known name it starts with, so
 * «nutella veg» goes by «nutella», else Altro. Undefined when the model knows the name itself, or there is no name.
 */
export function newItemSection(model: ListModel, text: string): string | undefined {
  const key = itemKey(text);
  if (key === '' || model.items[key]) return undefined;
  return sectionOf(model, text) ?? OTHER_SECTION;
}

/**
 * An item written in a list that the model does not know by its own name is learnt, marked new, in the section of the
 * known name it starts with or in Altro, so the model proposes it next time and someone confirms or moves it (user's
 * choices, 2026-11-18: a variant as «nutella veg» is a new item, not «nutella»). Known, or no name: the same activity.
 */
export function learnItem(a: Activity, text: string, _by: AccountId, now: Instant): Activity {
  const m = modelOf(a);
  const name = splitQuantity(text).name;
  const section = newItemSection(m, name);
  if (section === undefined) return a;
  return withModel(a, { ...m, items: { ...m.items, [itemKey(name)]: { name, section, fresh: true } } }, now);
}

export function removeModelItem(a: Activity, key: string, _by: AccountId, now: Instant): Activity {
  const m = modelOf(a);
  if (!m.items[key]) fail('NOT_FOUND', `item ${key}`);
  const { [key]: _gone, ...items } = m.items;
  return withModel(a, { ...m, items }, now);
}

/** The model's items in a section, by name; `fresh` for those learnt from a list and not yet placed. */
export function itemsIn(model: ListModel, sectionId: string): Array<{ key: string; name: string; fresh: boolean }> {
  return Object.entries(model.items)
    .filter(([, it]) => (model.sections.some(s => s.id === it.section) ? it.section : OTHER_SECTION) === sectionId)
    .map(([key, it]) => ({ key, name: it.name, fresh: it.fresh === true }))
    .sort((x, y) => x.name.localeCompare(y.name, 'it', { sensitivity: 'base' }));
}

/**
 * The items of the lists using the model that the model does not know by their own name, each once, by name, with the
 * section they would go to (`newItemSection`): written before it learnt them, or by someone who cannot change it.
 * Shown there as new.
 */
export function unplacedItems(model: ListModel, lists: readonly Activity[]): Array<{ name: string; section: string }> {
  const seen = new Map<string, { name: string; section: string }>();
  for (const l of lists) {
    for (const i of l.checklist?.items ?? []) {
      const name = splitQuantity(i.text).name;
      const key = itemKey(name);
      const section = seen.has(key) ? undefined : newItemSection(model, name);
      if (section !== undefined) seen.set(key, { name, section });
    }
  }
  return [...seen.values()].sort((x, y) => x.name.localeCompare(y.name, 'it', { sensitivity: 'base' }));
}
