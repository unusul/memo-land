import { expect, test } from 'vitest';
import { addItem, complete, removeItem, setListFixed, suggestItems, toggleItem } from '../src/index.js';
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
