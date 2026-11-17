import type { Activity, Instant } from './types.js';

/*
 * Two switches of the detail (user's choices, 2026-11-17), the group's and not one person's, as the priority:
 * - «Informazione utile»: something to know, not to do («Scuola 8–13»): in the Agenda on its day, always reduced and
 *   grey; never in the Calendar; not counted among the things of the day.
 * - «Non mostrare in calendario»: an ordinary activity that stays in the Agenda but not in the Calendar.
 */

export function setInfo(a: Activity, on: boolean, now: Instant): Activity {
  const { info: _old, ...rest } = a;
  return { ...(on ? { ...rest, info: true as const } : rest), updatedAt: now };
}

export function setOffCalendar(a: Activity, on: boolean, now: Instant): Activity {
  const { offCalendar: _old, ...rest } = a;
  return { ...(on ? { ...rest, offCalendar: true as const } : rest), updatedAt: now };
}

/** Whether the Calendar leaves the activity out: an information, or one switched off there. */
export const outOfCalendar = (a: Pick<Activity, 'info' | 'offCalendar'>): boolean => a.info === true || a.offCalendar === true;
