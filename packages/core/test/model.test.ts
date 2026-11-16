import { expect, test } from 'vitest';
import {
  SUPERMARKET_ITEMS, SUPERMARKET_SECTIONS, addItem, addSection, isModel, itemKey, itemsIn, moveSection, newModel, placeItem,
  removeModelItem, removeSection, renameModel, renameSection, sectionOf, setListModel, setModelIcon, sortBySection,
  toggleItem, unplacedItems,
} from '../src/index.js';
import type { Activity } from '../src/index.js';
import { base, t1, t2 } from './fixtures.js';

const ready = () => newModel({ id: 'g1#model:m1', groupId: 'g1', accountId: 'u1', name: 'Supermercato', ready: true }, t1);
const empty = () => newModel({ id: 'g1#model:m2', groupId: 'g1', accountId: 'u1', name: 'Videogiochi', ready: false }, t1);
const withItems = (...texts: string[]) => texts.reduce<Activity>((a, t) => addItem(a, t, 'u1', t1), base);
const open = (a: Activity) => a.checklist!.items.filter(i => !i.done).map(i => i.text);
const names = (m: Activity) => m.model!.sections.map(s => s.name);
const idOf = (m: Activity, name: string) => m.model!.sections.find(s => s.name === name)!.id;

/** «Supermercato (pronto)»: the user's sections (2026-11-16) in that order, the ready items, the cart as icon. */
test('testReadyModelHasTheUserSectionsAndItems', () => {
  const m = ready();
  expect(isModel(m)).toBe(true);
  expect(m.title).toBe('Supermercato');
  expect(m.groupId).toBe('g1');
  expect(m.model!.icon).toBe('shopping');
  expect(names(m)).toEqual(['Frutta e verdura', 'Banco frigo', 'Panetteria', 'Colazione e dolci', 'Pasta e riso', 'Conserve',
    'Scatolame', 'Condimenti e spezie', 'Bevande', 'Surgelati', 'Casa e pulizia', 'Igiene personale', 'Altro']);
  expect(SUPERMARKET_SECTIONS.map(s => s.name)).toEqual(names(m));
  expect(m.model!.items[itemKey('zucchine')]).toEqual({ name: 'zucchina', section: 'frutta' });
});

/** «Vuoto»: only Altro, which always stays; any kind of list (games, films). */
test('testEmptyModelHasOnlyAltro', () => {
  const m = empty();
  expect(names(m)).toEqual(['Altro']);
  expect(m.model!.items).toEqual({});
  expect(() => newModel({ id: 'x', groupId: 'g1', accountId: 'u1', name: '  ', ready: false }, t1)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

/** Case, accents, the quantity and singular or plural do not count. */
test('testItemKeyIgnoresCaseAccentsQuantityAndPlural', () => {
  expect(itemKey('Zucchine 3')).toBe(itemKey('zucchina'));
  expect(itemKey('ARANCE')).toBe(itemKey('arancia'));
  expect(itemKey('funghi')).toBe(itemKey('fungo'));
  expect(itemKey('radicchi')).toBe(itemKey('radicchio'));
  expect(itemKey('oli')).toBe(itemKey('olio'));
  expect(itemKey('Caffè')).toBe(itemKey('caffe'));
  expect(itemKey('succo d’arancia')).toBe(itemKey("succo d'arancia"));
  // Only the last vowel goes: stripping them all made «cacao» and «cachi» the same word.
  expect(itemKey('cacao')).not.toBe(itemKey('cachi'));
});

test('testSectionOfKnownAndUnknownItems', () => {
  const m = ready().model!;
  expect(sectionOf(m, 'Zucchine 2')).toBe('frutta');
  expect(sectionOf(m, 'burrata di bufala')).toBe('frigo');
  expect(sectionOf(m, 'kombucha artigianale')).toBeUndefined();
});

/** Vegetarian (user's choice, 2026-11-16): no meat, fish or cold cuts in the ready model. */
test('testReadyModelIsVegetarian', () => {
  const m = ready().model!;
  for (const p of ['prosciutto', 'salame', 'pollo', 'tonno', 'salmone', 'carne macinata', 'bresaola', 'merluzzo']) expect(sectionOf(m, p)).toBeUndefined();
});

/** Without the exact name, the longest known name the text starts with: «latte di soia» is not «latte». */
test('testLongestKnownStartWins', () => {
  const m = ready().model!;
  expect(sectionOf(m, 'latte di soia')).toBe('colazione');
  expect(sectionOf(m, 'latte intero')).toBe('frigo');
  expect(sectionOf(m, 'pasta fresca')).toBe('frigo');
  expect(sectionOf(m, 'pasta di Gragnano')).toBe('pasta');
});

/** The list records only which model it uses; none takes it away. */
test('testListChoosesItsModel', () => {
  let l = setListModel(withItems('latte'), 'g1#model:m1', 'u1', t2);
  expect(l.checklist!.model).toBe('g1#model:m1');
  expect(l.updatedAt).toBe(t2);
  l = setListModel(l, null, 'u1', t2);
  expect(l.checklist!.model).toBeUndefined();
  expect(open(l)).toEqual(['latte']);
});

/** Sorting puts the items to do in the sections' order; unknown ones go with Altro; same section keeps its order. */
test('testSortFollowsTheSectionsOrder', () => {
  const l = sortBySection(withItems('detersivo', 'latte', 'kombucha', 'zucchine', 'yogurt', 'mele'), ready().model!, 'u1', t2);
  expect(open(l)).toEqual(['zucchine', 'mele', 'latte', 'yogurt', 'detersivo', 'kombucha']);
  expect(l.updatedAt).toBe(t2);
});

/** «Altro» goes where it is put among the sections, and the unknown items with it. */
test('testAltroWhereverItIs', () => {
  const m = moveSection(ready(), 'altro', 0, 'u1', t2);
  expect(names(m)[0]).toBe('Altro');
  expect(open(sortBySection(withItems('latte', 'kombucha', 'zucchine'), m.model!, 'u1', t2))).toEqual(['kombucha', 'zucchine', 'latte']);
});

/** Ticked items keep their slots, as with the handle: they come back where they were. */
test('testSortLeavesTickedItemsInTheirSlots', () => {
  let l = withItems('latte', 'pane', 'zucchine');
  l = toggleItem(l, l.checklist!.items[1]!.id, 'u1', t1);
  l = sortBySection(l, ready().model!, 'u1', t2);
  expect(l.checklist!.items.map(i => i.text)).toEqual(['zucchine', 'pane', 'latte']);
});

test('testSortInOrderChangesNothing', () => {
  const l = withItems('zucchine', 'latte');
  expect(sortBySection(l, ready().model!, 'u1', t2)).toBe(l);
});

test('testRenameModelAndIcon', () => {
  let m = renameModel(ready(), ' Spesa Esselunga ', 'u1', t2);
  m = setModelIcon(m, 'kitchen', 'u1', t2);
  expect(m.title).toBe('Spesa Esselunga');
  expect(m.model!.icon).toBe('kitchen');
  expect(() => renameModel(m, ' ', 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

test('testAddRenameMoveSections', () => {
  let m = addSection(empty(), ' Avventura ', 'u1', t2);
  m = addSection(m, 'Sport', 'u1', t2);
  expect(names(m)).toEqual(['Avventura', 'Sport', 'Altro']);
  m = renameSection(m, idOf(m, 'Sport'), 'Corse', 'u1', t2);
  m = moveSection(m, idOf(m, 'Corse'), 0, 'u1', t2);
  expect(names(m)).toEqual(['Corse', 'Avventura', 'Altro']);
  expect(() => addSection(m, 'corse', 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(() => renameSection(m, idOf(m, 'Corse'), '  ', 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

/** A section taken away hands its items to Altro; Altro itself stays. */
test('testRemovedSectionHandsItsItemsToAltro', () => {
  const m = removeSection(ready(), 'bevande', 'u1', t2);
  expect(names(m)).not.toContain('Bevande');
  expect(sectionOf(m.model!, 'acqua')).toBe('altro');
  expect(() => removeSection(m, 'altro', 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

/** Placing adds a new item, or moves a known one keeping its written name; removing forgets it. */
test('testPlaceAndRemoveItems', () => {
  let m = placeItem(ready(), 'Kombucha 2', 'bevande', 'u1', t2);
  expect(sectionOf(m.model!, 'kombucha')).toBe('bevande');
  expect(m.model!.items[itemKey('kombucha')]!.name).toBe('Kombucha');
  m = placeItem(m, 'zucchine', 'altro', 'u1', t2);
  expect(m.model!.items[itemKey('zucchina')]).toEqual({ name: 'zucchina', section: 'altro' });
  m = removeModelItem(m, itemKey('kombucha'), 'u1', t2);
  expect(sectionOf(m.model!, 'kombucha')).toBeUndefined();
});

test('testItemsInASection', () => {
  let m = addSection(empty(), 'Avventura', 'u1', t2);
  m = placeItem(m, 'Zelda', idOf(m, 'Avventura'), 'u1', t2);
  m = placeItem(m, 'Celeste', idOf(m, 'Avventura'), 'u1', t2);
  expect(itemsIn(m.model!, idOf(m, 'Avventura')).map(i => i.name)).toEqual(['Celeste', 'Zelda']);
  expect(itemsIn(m.model!, 'altro')).toEqual([]);
});

/** «Senza sezione»: what the lists using the model hold and the model does not know, each once. */
test('testUnplacedItemsOfTheLists', () => {
  const lists = [withItems('latte', 'kombucha', 'Tempeh'), withItems('kombucha 2', 'birra artigianale')];
  expect(unplacedItems(ready().model!, lists)).toEqual(['kombucha']);
});

/** Each ready item in one section only, and every section one of the ready ones. */
test('testReadyModelHasNoItemTwice', () => {
  const seen = new Map<string, string>();
  const twice: string[] = [];
  for (const [section, items] of Object.entries(SUPERMARKET_ITEMS)) {
    expect(SUPERMARKET_SECTIONS.some(s => s.id === section)).toBe(true);
    for (const p of items) {
      const before = seen.get(itemKey(p));
      if (before !== undefined) twice.push(`${p} (${section}) = ${before}`);
      else seen.set(itemKey(p), `${p} (${section})`);
    }
  }
  expect(twice).toEqual([]);
});
