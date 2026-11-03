import { expect, test } from 'vitest';
import { archive, buildAgenda, snooze } from '../src/index.js';
import { costTask, domainGroup, inviteGroup, seriesForPippo, t1, waitingMemo } from './fixtures.js';

test('testAgendaMergesGroupsAndSeparatesWaiting', () => {
  const r = buildAgenda([{ group: domainGroup, activities: [seriesForPippo, waitingMemo] }, { group: inviteGroup, activities: [costTask] }],
    '2026-11-02T00:00', '2026-11-08T23:59');
  expect(Object.keys(r.days)).toEqual(['2026-11-03', '2026-11-05', '2026-11-06']);
  expect(r.days['2026-11-06']?.[0]).toMatchObject({ activityId: 'cost', groupId: 'inv1', accountId: 'u1', title: 'cost analysis', shape: 'task' });
  expect(r.waiting.map(a => a.id)).toEqual([waitingMemo.id]);
});

test('testDateOnlyItemsComeFirstInDay', () => {
  const event = { ...costTask, id: 'e1', props: { schedule: { start: '2026-11-06T15:00' } } };
  const r = buildAgenda([{ group: inviteGroup, activities: [event, costTask] }], '2026-11-06T00:00', '2026-11-06T23:59');
  expect(r.days['2026-11-06']?.map(i => i.activityId)).toEqual([costTask.id, 'e1']);
});

test('testArchivedDoneAndSnoozedAreExcluded', () => {
  const r = buildAgenda([{ group: inviteGroup, activities: [
    archive(costTask, 'u1', t1),
    { ...costTask, id: 'd', status: 'done' },
    snooze({ ...costTask, id: 's' }, '2026-12-01', 'u1', t1),
  ] }], '2026-11-01T00:00', '2026-11-30T23:59');
  expect(r.days).toEqual({});
  expect(r.waiting).toEqual([]);
});
