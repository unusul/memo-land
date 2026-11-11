import { expect, test } from 'vitest';
import { archive, buildAgenda, needsAttention, snooze } from '../src/index.js';
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

test('testOverdueCountsOnlyWhatIsMineOrFree', () => {
  const mine = { ...costTask, id: 'mine', props: { due: '2026-11-06', assignment: { state: 'accepted' as const, assignee: 'u1', assignedBy: 'u2' } } };
  const theirs = { ...costTask, id: 'theirs', props: { due: '2026-11-06', assignment: { state: 'accepted' as const, assignee: 'u2', assignedBy: 'u2' } } };
  const future = { ...costTask, id: 'future', props: { due: '2026-11-20' } };
  const today = { ...costTask, id: 'today', props: { due: '2026-11-11' } };
  const event = { ...costTask, id: 'event', props: { schedule: { start: '2026-11-02T10:00' } } };
  const r = needsAttention([{ group: inviteGroup, activities: [costTask, mine, theirs, future, today, event,
    archive({ ...costTask, id: 'gone' }, 'u1', t1), snooze({ ...costTask, id: 'later' }, '2026-12-01', 'u1', t1)] }], 'u1', '2026-11-11');
  expect(r.overdue.map(o => o.activity.id)).toEqual(['cost', 'mine']);
  expect(r.overdue[0]).toMatchObject({ groupId: 'inv1', since: '2026-11-06' });
});

/** A calendar series has no overdue occurrences (they are events that passed); a series from completion does. */
test('testOverdueSeries', () => {
  const calendar = { ...costTask, id: 'cal', props: { due: '2026-11-02', repeat: { mode: 'calendar' as const, rrule: 'FREQ=WEEKLY' } } };
  const fromDone = { ...costTask, id: 'fc', props: { due: '2026-10-01', repeat: { mode: 'fromCompletion' as const, every: { unit: 'month' as const, count: 1 } } } };
  const r = needsAttention([{ group: inviteGroup, activities: [calendar, fromDone] }], 'u1', '2026-11-11');
  expect(r.overdue.map(o => o.activity.id)).toEqual(['fc']);
});

test('testProposalsWaitingForMe', () => {
  const toMe = { ...costTask, id: 'p1', props: { due: '2026-11-20', assignment: { state: 'proposed' as const, assignee: 'u1', assignedBy: 'u2' } } };
  const toThem = { ...costTask, id: 'p2', props: { assignment: { state: 'proposed' as const, assignee: 'u2', assignedBy: 'u1' } } };
  const r = needsAttention([{ group: inviteGroup, activities: [toMe, toThem] }], 'u1', '2026-11-11');
  expect(r.proposed.map(p => p.activity.id)).toEqual(['p1']);
  expect(r.count).toBe(1);
});
