import { expect, test } from 'vitest';
import { addItem, complete, editItem, moveItem, removeItem, setListFixed, splitQuantity, suggestItems, toggleItem } from '../src/index.js';
import { base, t1, t2, task } from './fixtures.js';

const texts = (a: typeof base) => a.checklist?.items.map(i => `${i.done ? 'x' : ' '} ${i.text}`);

test('testAddToggleRemove', () => {
  let a = addItem(addItem(base, ' latte ', 'u1', t1), 'pane', 'u1', t1);
  expect(texts(a)).toEqual(['  latte', '  pane']);
  a = toggleItem(a, a.checklist!.items[0]!.id, 'u1', t2);
  expect(texts(a)).toEqual(['x latte', '  pane']);
  a = removeItem(a, a.checklist!.items[1]!.id, 'u1', t2);
  expect(texts(a)).toEqual(['x latte']);
  expect(a.updatedAt).toBe(t2);
  expect(base.checklist).toBeUndefined();
});

test('testOpenDuplicateIsNotAddedAndEmptyIsRefused', () => {
  const a = addItem(base, 'Latte', 'u1', t1);
  expect(addItem(a, ' latte', 'u1', t2)).toBe(a);
  expect(() => addItem(a, '   ', 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

test('testEditChangesTheTextAndKeepsPlaceAndTick', () => {
  let a = addItem(addItem(base, 'lattte', 'u1', t1), 'pane', 'u1', t1);
  a = toggleItem(a, a.checklist!.items[0]!.id, 'u1', t1);
  const edited = editItem(a, a.checklist!.items[0]!.id, ' latte ', 'u1', t2);
  expect(texts(edited)).toEqual(['x latte', '  pane']);
  expect(edited.checklist!.items[0]!.id).toBe(a.checklist!.items[0]!.id);
  expect(edited.updatedAt).toBe(t2);
  // The same text (spaces aside) changes nothing.
  expect(editItem(edited, edited.checklist!.items[0]!.id, 'latte ', 'u1', t2)).toBe(edited);
  expect(() => editItem(a, a.checklist!.items[0]!.id, '  ', 'u1', t2)).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(() => editItem(a, 'nope', 'latte', 'u1', t2)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
});

test('testEditMovesTheSuggestionToTheNewText', () => {
  let a = addItem(base, 'lattte', 'u1', t1);
  a = editItem(a, a.checklist!.items[0]!.id, 'latte', 'u1', t1);
  a = removeItem(a, a.checklist!.items[0]!.id, 'u1', t1);
  // A typo fixed is not proposed again; the corrected text is.
  expect(suggestItems(a, 'lat')).toEqual(['latte']);
});

test('testANumberAtTheEndIsTheQuantity', () => {
  expect(splitQuantity(' latte  3 ')).toEqual({ name: 'latte', quantity: 3 });
  expect(splitQuantity('latte')).toEqual({ name: 'latte', quantity: null });
  // A number alone, a zero or a number glued to the word are text.
  expect(splitQuantity('3')).toEqual({ name: '3', quantity: null });
  expect(splitQuantity('latte 0')).toEqual({ name: 'latte 0', quantity: null });
  expect(splitQuantity('pile AA4')).toEqual({ name: 'pile AA4', quantity: null });
  expect(splitQuantity('uova 1000')).toEqual({ name: 'uova 1000', quantity: null });
});

test('testAddingAQuantityToAnOpenItemSumsIt', () => {
  let a = addItem(base, 'Latte 2', 'u1', t1);
  a = addItem(a, 'latte 3', 'u1', t1);
  expect(texts(a)).toEqual(['  Latte 5']);
  // An open item with no number counts as one; the same text with no number is still a duplicate.
  a = addItem(addItem(base, 'pane', 'u1', t1), 'pane 2', 'u1', t1);
  expect(texts(a)).toEqual(['  pane 3']);
  expect(addItem(a, 'pane', 'u1', t2)).toBe(a);
});

test('testSuggestionsLeaveTheQuantityOut', () => {
  let a = addItem(base, 'latte 3', 'u1', t1);
  a = removeItem(a, a.checklist!.items[0]!.id, 'u1', t1);
  expect(suggestItems(a, 'la')).toEqual(['latte']);
  a = addItem(a, 'latte 2', 'u1', t1);
  expect(suggestItems(a, 'la')).toEqual([]);
  // Changing only the number leaves the suggestions as they were.
  const known = a.checklist!.known;
  a = editItem(a, a.checklist!.items[0]!.id, 'latte 4', 'u1', t1);
  expect(a.checklist!.known).toEqual(known);
});

test('testMoveReordersTheOpenItemsAndLeavesTheTickedWhereTheyAre', () => {
  let a = base;
  for (const t of ['a', 'b', 'c', 'd']) a = addItem(a, t, 'u1', t1);
  a = toggleItem(a, a.checklist!.items[1]!.id, 'u1', t1);
  const id = (t: string) => a.checklist!.items.find(i => i.text === t)!.id;
  // Open items are a, c, d: d goes first among them; b, ticked, keeps its slot.
  let moved = moveItem(a, id('d'), 0, 'u1', t2);
  expect(texts(moved)).toEqual(['  d', 'x b', '  a', '  c']);
  expect(moved.updatedAt).toBe(t2);
  moved = moveItem(a, id('a'), 2, 'u1', t2);
  expect(texts(moved)).toEqual(['  c', 'x b', '  d', '  a']);
  // Beyond the end is the end; the same place changes nothing.
  expect(texts(moveItem(a, id('a'), 9, 'u1', t2))).toEqual(['  c', 'x b', '  d', '  a']);
  expect(moveItem(a, id('c'), 1, 'u1', t2)).toBe(a);
  expect(() => moveItem(a, id('b'), 0, 'u1', t2)).toThrow(expect.objectContaining({ code: 'NOT_FOUND' }));
});

test('testSuggestionsComeFromEverythingTheListHasSeen', () => {
  let a = base;
  for (const t of ['latte', 'lardo', 'latte', 'pane', 'latte', 'lattuga']) {
    a = addItem(a, t, 'u1', t1);
    a = removeItem(a, a.checklist!.items.at(-1)!.id, 'u1', t1);
  }
  a = addItem(a, 'lattuga', 'u1', t1);
  // Most used first; "lattuga" is already in the list, so it is not proposed again.
  expect(suggestItems(a, 'La')).toEqual(['latte', 'lardo']);
  expect(suggestItems(a, '')).toEqual(['latte', 'lardo', 'pane']);
  expect(suggestItems(base, 'la')).toEqual([]);
});

test('testCompletingARecurringListDropsWhatWasDone', () => {
  let a = addItem(addItem({ ...task, props: { due: '2026-11-10', repeat: { mode: 'fromCompletion', every: { unit: 'week', count: 1 } } } }, 'latte', 'u1', t1), 'pane', 'u1', t1);
  a = toggleItem(a, a.checklist!.items[0]!.id, 'u1', t1);
  const next = complete(a, 'u1', '2026-11-10', t2);
  expect(texts(next)).toEqual(['  pane']);
  expect(suggestItems(next, 'la')).toEqual(['latte']);
});

test('testCompletingAFixedListUnchecksEverything', () => {
  let a = addItem(addItem({ ...task, props: { due: '2026-11-10', repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY' } } }, 'passaporto', 'u1', t1), 'caricatore', 'u1', t1);
  a = setListFixed(a, true, 'u1', t1);
  a = toggleItem(a, a.checklist!.items[0]!.id, 'u1', t1);
  expect(texts(complete(a, 'u1', '2026-11-10', t2))).toEqual(['  passaporto', '  caricatore']);
});

test('testCompletingAOneOffActivityKeepsItsList', () => {
  let a = addItem(task, 'latte', 'u1', t1);
  a = toggleItem(a, a.checklist!.items[0]!.id, 'u1', t1);
  expect(texts(complete(a, 'u1', '2026-11-10', t2))).toEqual(['x latte']);
});
