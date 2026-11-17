import { expect, test } from 'vitest';
import { outOfCalendar, setInfo, setOffCalendar } from '../src/index.js';
import { series, t1, t2 } from './fixtures.js';

/** The two switches of the detail (user's choices, 2026-11-17): on and off, and what leaves the Calendar. */
test('testInfoAndOffCalendarSwitch', () => {
  const info = setInfo(series, true, t1);
  expect([info.info, info.updatedAt, outOfCalendar(info)]).toEqual([true, t1, true]);
  expect('info' in setInfo(info, false, t2)).toBe(false);
  const off = setOffCalendar(series, true, t1);
  expect([off.offCalendar, off.info, outOfCalendar(off)]).toEqual([true, undefined, true]);
  expect(outOfCalendar(setOffCalendar(off, false, t2))).toBe(false);
  expect(outOfCalendar(series)).toBe(false);
});
