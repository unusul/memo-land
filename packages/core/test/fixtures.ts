import { newActivity } from '../src/index.js';
import type { Activity, Group } from '../src/index.js';

export const now = '2026-11-03T08:00:00Z';
export const t1 = '2026-11-03T09:00:00Z';
export const t2 = '2026-11-03T10:00:00Z';

export const base: Activity = newActivity({ id: 'a1', accountId: 'u1', title: 'app gestione core' }, now);
export const draft: Activity = base;
export const task: Activity = { ...base, id: 't1', groupId: 'g1', props: { due: '2026-11-10' } };
export const movedIdea: Activity = { ...base, id: 'i1', groupId: 'p1' };

/** Tuesday and Thursday at 09:00, assigned to pippo. */
export const series: Activity = {
  ...task, id: 's1', groupId: 'd1', props: {
    schedule: { start: '2026-10-20T09:00', end: '2026-10-20T09:30' },
    repeat: { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' },
    assignment: { state: 'accepted', assignee: 'pippo', assignedBy: 'u1' },
  },
};
export const seriesForPippo: Activity = series;

export const costTask: Activity = { ...task, id: 'cost', groupId: 'inv1', title: 'cost analysis', props: { due: '2026-11-06' } };
export const waitingMemo: Activity = { ...task, id: 'w1', groupId: 'd1', props: { waitingFor: { condition: 'ops 412 closed' } } };
export const unrelated: Activity = { ...task, id: 'u-x', groupId: 'd1', props: { due: '2026-11-12' } };

export const domainGroup: Group = {
  id: 'd1', kind: 'domain', name: 'altereos.com', domain: 'altereos.com', timeZone: 'Europe/Rome',
  members: { pippo: 'member', pluto: 'member' }, version: 1,
};
export const inviteGroup: Group = {
  id: 'inv1', kind: 'invite', name: 'developers', ownerId: 'u1', timeZone: 'Europe/Rome',
  members: { u1: 'owner', u3: 'member', guest1: 'guest' }, version: 1,
};
export const personalGroup: Group = {
  id: 'p1', kind: 'personal', name: 'personal', ownerId: 'u1', timeZone: 'Europe/Rome', members: { u1: 'owner' }, version: 1,
};

export const monthly: Activity = {
  ...task, id: 'm1', props: { due: '2026-11-01', repeat: { mode: 'fromCompletion', every: { unit: 'month', count: 1 } } },
};
