import { expect, test } from 'vitest';
import { addLabel, groupLabels, labelOf, labelsIn, sectionLabelOf, toggleLabel, withGroupLabels } from '../src/index.js';
import type { Activity } from '../src/index.js';
import { base, t1, t2 } from './fixtures.js';

/*
 * Labels (user's choices, 2026-11-26): one word in lower case, from the group's list, which starts with «memo» (the
 * groups made before too) and lives in a hidden activity of the group.
 */

test('testALabelIsOneLowerCaseWord', () => {
  expect(labelOf('  Da Ricordare ')).toBe('daricordare');
  expect(addLabel(['memo'], 'Casa')).toEqual(['memo', 'casa']);
  expect(() => addLabel(['memo'], ' MEMO ')).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
  expect(() => addLabel(['memo'], '   ')).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
});

/** Every group has «memo» until its list is changed; then the list activity says, the oldest if two were made. */
test('testTheGroupsLabels', () => {
  expect(groupLabels([], 'g1')).toEqual(['memo']);
  const first = withGroupLabels([], 'g1', ['memo', 'casa'], 'L1', 'u1', t1);
  expect(first).toMatchObject({ id: 'L1', groupId: 'g1', labelSet: { labels: ['memo', 'casa'] } });
  const second: Activity = { ...withGroupLabels([], 'g1', [], 'L2', 'u2', t2) };
  expect(groupLabels([second, first], 'g1')).toEqual(['memo', 'casa']);
  expect(groupLabels([first], 'g2')).toEqual(['memo']);
  const changed = withGroupLabels([first], 'g1', ['casa'], 'L3', 'u1', t2);
  expect([changed.id, changed.labelSet]).toEqual(['L1', { labels: ['casa'] }]);
  expect(groupLabels([changed], 'g1')).toEqual(['casa']);
});

/** On an activity: switched on and off; its section is the first label in the group's order, gone labels ignored. */
test('testAnActivitysLabels', () => {
  let a = toggleLabel(toggleLabel(base, 'casa', t1), 'memo', t1);
  expect(a.labels).toEqual(['casa', 'memo']);
  expect(sectionLabelOf(a, ['memo', 'casa'])).toBe('memo');
  expect(labelsIn(a, ['casa', 'spesa'])).toEqual(['casa']);
  expect(sectionLabelOf(a, ['spesa'])).toBeUndefined();
  a = toggleLabel(toggleLabel(a, 'casa', t2), 'memo', t2);
  expect(a.labels).toBeUndefined();
  expect(a.updatedAt).toBe(t2);
});
