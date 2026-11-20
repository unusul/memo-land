import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { newActivity, occurrencesBetween, parseIcs, planIcsImport, setProp } from '../src/index.js';
import type { Activity, IcsImportPlan } from '../src/index.js';

/*
 * Import from Google Calendar (user's choices, 2026-11-20): a file at a time into one group, only what still counts from
 * today, doubles skipped by title and start, reminders not imported. The sample file is written by hand in Google's
 * export format, one event per case.
 */

const sample = readFileSync(new URL('./google-calendar-sample.ics', import.meta.url), 'utf8');
const now = '2026-11-20T09:00:00Z';
const dinner: Activity = setProp(newActivity({ id: 'x1', accountId: 'u1', title: 'Cena già presente', groupId: 'p1' }, now),
  'schedule', { start: '2026-12-10T19:00' }, 'u1', now);

function plan(text = sample, existing: Activity[] = [dinner]): IcsImportPlan {
  let n = 0;
  return planIcsImport({ events: parseIcs(text), groupId: 'p1', zone: 'Europe/Rome', existing, today: '2026-11-20',
    accountId: 'u1', now, newId: () => `imp${++n}` });
}

const byTitle = (title: string) => plan().activities.find(a => a.title === title)!;

test('testTheSampleIsSortedOut', () => {
  const p = plan();
  expect(p.activities.map(a => a.title)).toEqual(['Dentista', 'Immacolata', 'Montagna', 'Convegno di due giorni', 'Palestra',
    'Compleanno Cate', 'Chiamata in UTC', 'Call con New York', 'Titolo con virgola, punto e virgola; e una riga che Google piega perché è lunga']);
  expect(p).toMatchObject({ past: 2, unknownZone: 1, cancelled: 1, duplicates: 1, withAlarms: 1 });
});

test('testAnEventBecomesAnActivityOfTheGroup', () => {
  const a = byTitle('Dentista');
  expect(a).toMatchObject({ groupId: 'p1', accountId: 'u1', status: 'open', props: { schedule: { start: '2026-11-25T10:00', end: '2026-11-25T11:00' } } });
  expect(a.body).toBe('Portare le lastre\ne la tessera & il referto\n\nLuogo: Via Roma 1, Milano');
});

/** Whole days are dates without a time; days in a row keep the first and say the last in the text. */
test('testWholeDaysAreDates', () => {
  expect(byTitle('Immacolata').props).toEqual({ due: '2026-12-08' });
  expect(byTitle('Montagna')).toMatchObject({ props: { due: '2026-12-27' }, body: 'Fino al 2026-12-29' });
  expect(byTitle('Convegno di due giorni').body).toBe('Fino al 2026-11-20');
});

/** Times in UTC or in another zone are read in the group's. */
test('testTimesAreReadInTheGroupZone', () => {
  expect(byTitle('Chiamata in UTC').props.schedule).toEqual({ start: '2026-12-01T15:00', end: '2026-12-01T16:00' });
  expect(byTitle('Call con New York').props.schedule).toEqual({ start: '2026-12-03T15:00', end: '2026-12-03T16:00' });
});

/** A series born in 2023 and still going comes in whole, with its day out, its moved time and its cancelled one. */
test('testALiveSeriesComesWithItsChanges', () => {
  const gym = byTitle('Palestra');
  expect(gym.props.repeat).toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE' });
  expect(gym.body).toBe('Videochiamata: https://meet.google.com/abc-defg-hij');
  const rows = occurrencesBetween(gym, '2026-11-23T00:00', '2026-12-09T23:59');
  expect(rows.filter(o => o.skipped).map(o => o.start)).toEqual(['2026-11-25T18:30', '2026-12-07T18:30']);
  expect(rows.find(o => o.movedFrom === '2026-11-30T18:30')?.start).toBe('2026-12-02T20:00');
});

test('testAYearlyWholeDaySeriesIsKept', () => {
  expect(byTitle('Compleanno Cate').props).toMatchObject({ due: '2020-03-15', repeat: { rrule: 'FREQ=YEARLY' } });
});

/** The UNTIL of the file becomes the series' last day; a series still going ends there. */
test('testUntilBecomesTheLastDay', () => {
  const ics = sample.replace('RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T225959Z');
  expect(plan(ics).activities.find(a => a.title === 'Palestra')?.props.repeat)
    .toEqual({ mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=MO,WE', until: '2026-12-31' });
});

/** Importing the same file twice brings nothing new. */
test('testASecondImportSkipsEverything', () => {
  const first = plan();
  const again = plan(sample, [dinner, ...first.activities]);
  expect(again.activities).toEqual([]);
  expect(again.duplicates).toBe(first.activities.length + 1);
});

test('testTheSameEventTwiceInTheFileIsKeptOnce', () => {
  const twice = `BEGIN:VCALENDAR\n${['a', 'b'].map(uid => `BEGIN:VEVENT\nUID:${uid}\nSUMMARY:Doppio\nDTSTART;TZID=Europe/Rome:20261201T100000\nEND:VEVENT`).join('\n')}\nEND:VCALENDAR`;
  expect(plan(twice, [])).toMatchObject({ activities: [{ title: 'Doppio' }], duplicates: 1 });
});
