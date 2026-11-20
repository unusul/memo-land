import { afterEach, expect, test } from 'vitest';
import { alertEntries, alertKey, dueAlerts, instantIn, localIn, NO_GENERAL, takeOccurrence } from '../src/index.js';
import type { AlertPerson, AlertWho } from '../src/index.js';
import { costTask, inviteGroup } from './fixtures.js';

const deviceZone = process.env.TZ;
afterEach(() => {
  if (deviceZone === undefined) delete process.env.TZ; else process.env.TZ = deviceZone;
});

/** Every half hour of a day, «2026-03-29T00:00» to «2026-03-29T23:30». */
const halfHours = (day: string) => Array.from({ length: 48 }, (_, i) => `${day}T${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/**
 * The time zone is explicit since 2026-11-19: the server computes the alerts too, and it runs in UTC. Before, the app
 * read a local time with `new Date(local)`, in the device's zone; on the server that would put every alert an hour or
 * two off. Here the new form and the old one, on a device set to the same zone, are run over the same times, the days
 * of the spring and autumn changes included: an hour that happens twice is the first one, an hour that does not exist
 * is read with the offset before the change (02:30 becomes 03:30), as `new Date` does.
 */
test('testInstantInReadsATimeAsTheDeviceDid', () => {
  for (const zone of ['Europe/Rome', 'America/New_York']) {
    process.env.TZ = zone;
    const days = zone === 'Europe/Rome' ? ['2026-03-29', '2026-10-25', '2026-11-19'] : ['2026-03-08', '2026-11-01'];
    for (const local of days.flatMap(halfHours)) {
      expect(instantIn(zone, local).toISOString(), `${zone} ${local}`).toBe(new Date(local).toISOString());
    }
  }
});

/** The wall clock of a zone at an instant, as the device's own clock showed it. */
test('testLocalInIsTheZonesWallClock', () => {
  expect(localIn('Europe/Rome', new Date('2026-11-19T17:00:00Z'))).toBe('2026-11-19T18:00');
  expect(localIn('Europe/Rome', new Date('2026-07-19T17:00:00Z'))).toBe('2026-07-19T19:00');
  expect(localIn('UTC', new Date('2026-11-19T23:59:00Z'))).toBe('2026-11-19T23:59');
  expect(localIn('Europe/Rome', new Date('2026-11-19T23:30:00Z'))).toBe('2026-11-20T00:30');
});

/** The same meeting alerts at 17:45 UTC for a person in Rome and at 18:45 UTC for one whose zone is UTC. */
test('testAlertsGoOffInThePersonsZone', () => {
  const meeting = { ...costTask, id: 'm', title: 'Riunione', props: { schedule: { start: '2026-11-20T18:45', end: '2026-11-20T19:30' } } };
  const sources = [{ group: inviteGroup, activities: [meeting] }];
  const own = () => ({ mode: 'here' as const, list: [{ of: 'start' as const, before: 60 }] });
  const at = (zone: string) => alertEntries(sources, () => 'u1', NO_GENERAL, new Date('2026-11-19T12:00:00Z'), own, zone).map(a => [a.at, a.text]);
  expect(at('Europe/Rome')).toEqual([['2026-11-20T16:45:00.000Z', `Tra 1 ora, 18:45: Riunione · ${inviteGroup.name}`]]);
  expect(at('UTC')).toEqual([['2026-11-20T17:45:00.000Z', `Tra 1 ora, 18:45: Riunione · ${inviteGroup.name}`]]);
});

/** Riunione on 20 November from 18:45 to 19:30 in Rome, alerted 15 minutes before by u1, and at its end. */
function person(over: Partial<AlertPerson> = {}): AlertPerson {
  const meeting = { ...costTask, id: 'm', title: 'Riunione', props: { schedule: { start: '2026-11-20T18:45', end: '2026-11-20T19:30' } } };
  return {
    account: 'u1', groups: [inviteGroup], activities: [meeting], zone: 'Europe/Rome',
    alerts: { m: { mode: 'here', list: [{ of: 'start', before: 15 }, { of: 'end', before: 0 }] } }, ...over,
  };
}

/**
 * The server sends what came due in the last half hour (2026-11-19): at 18:30 in Rome the alert 15 minutes before;
 * not a minute earlier; still at 18:59, not after half an hour (the server was down: dropped, not sent late). The
 * push says the title, then «tra 15 minuti · 18:45–19:30 · developers»; at the end «finisce ora · developers».
 */
test('testDueAlertsAreThoseOfTheLastHalfHour', () => {
  const at = (utc: string) => dueAlerts(person(), new Date(utc));
  expect(at('2026-11-20T17:29:00Z')).toEqual([]);
  const due = at('2026-11-20T17:30:00Z');
  expect(due.map(e => e.push)).toEqual([{ title: 'Riunione', body: 'tra 15 minuti · 18:45–19:30 · developers' }]);
  expect(due.map(alertKey)).toEqual(['m|start|15|2026-11-20T17:30:00.000Z']);
  expect(at('2026-11-20T17:59:00Z')).toHaveLength(1);
  expect(at('2026-11-20T18:00:00Z')).toEqual([]);
  expect(at('2026-11-20T18:30:00Z').map(e => e.push.body)).toEqual(['finisce ora · developers']);
});

/** Only the groups the person belongs to, and not an archived one; the zone is the person's. */
test('testDueAlertsFollowTheGroupsAndTheZone', () => {
  const now = new Date('2026-11-20T17:30:00Z');
  expect(dueAlerts(person({ account: 'u9', alerts: person().alerts }), now)).toEqual([]);
  expect(dueAlerts(person({ groups: [{ ...inviteGroup, archived: true }] }), now)).toEqual([]);
  expect(dueAlerts(person({ zone: 'UTC' }), new Date('2026-11-20T18:30:00Z')).map(e => e.push.body)).toEqual(['tra 15 minuti · 18:45–19:30 · developers']);
});

/**
 * «Per chi» of the bell (user's choice, 2026-11-20), occurrence by occurrence. A daily meeting of u3, whose 21 November
 * u1 takes, and one of nobody's, both alerted at their start by u1: `all` (and no `who`, as the alerts set before it)
 * alerts every time; `mineOrNobody` the one taken and nobody's; `mine` only the one taken. Before, a bell alerted u1 for
 * u3's times too, whatever u1 wanted.
 */
test('testWhoKeepsTheAlertsToTheTimesThatAreMine', () => {
  const series = takeOccurrence({
    ...costTask, id: 's', title: 'Turno',
    props: { schedule: { start: '2026-11-20T18:45' }, repeat: { mode: 'calendar', rrule: 'FREQ=DAILY;COUNT=3' }, assignment: { state: 'accepted', assignee: 'u3', assignedBy: 'u3' } },
  }, '2026-11-21T18:45', 'u1', 'owner', '2026-11-20T08:00:00Z');
  const free = { ...costTask, id: 'f', title: 'Libera', props: { schedule: { start: '2026-11-20T19:00' } } };
  const sources = [{ group: inviteGroup, activities: [series, free] }];
  const times = (who?: AlertWho) => alertEntries(sources, () => 'u1', NO_GENERAL, new Date('2026-11-20T12:00:00Z'),
    () => ({ mode: 'here', list: [{ of: 'start', before: 0 }], ...(who ? { who } : {}) }), 'Europe/Rome').map(e => `${e.activityId} ${e.time}`);
  const every = ['s 2026-11-20T18:45', 'f 2026-11-20T19:00', 's 2026-11-21T18:45', 's 2026-11-22T18:45'];
  expect(times()).toEqual(every);
  expect(times('all')).toEqual(every);
  expect(times('mineOrNobody')).toEqual(['f 2026-11-20T19:00', 's 2026-11-21T18:45']);
  expect(times('mine')).toEqual(['s 2026-11-21T18:45']);
});
