import { alertEntries as entriesIn } from '@attivita/core';
import type { AccountId, ActivityAlert, Alert, AlertChoice, AlertEntry, AgendaSource, GroupId } from '@attivita/core';

/*
 * The alerts are computed in the core since 2026-11-19, so the server computes them too; here the app gives them the
 * device's time zone, as it read its times before (`new Date(local)`).
 */
export { ALERT_DAYS, DAY_HOUR, MAX_ALERTS, NO_GENERAL, alertWords, beforeText } from '@attivita/core';
export type { Alert, AlertChoice, AlertEntry } from '@attivita/core';

/** The device's IANA time zone, «Europe/Rome». */
export const deviceZone = (): string => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** The alerts of the next days, as `alertEntries` but only when and what they say. */
export function alertsFor(sources: AgendaSource[], meIn: (groupId: GroupId) => AccountId, choice: AlertChoice, now = new Date(),
  own: (activityId: string) => ActivityAlert | undefined = () => undefined): Alert[] {
  return alertEntries(sources, meIn, choice, now, own).map(({ at, text }) => ({ at, text }));
}

/** The alerts of the next days, each with what it is about, in the device's time zone. */
export function alertEntries(sources: AgendaSource[], meIn: (groupId: GroupId) => AccountId, choice: AlertChoice, now = new Date(),
  own: (activityId: string) => ActivityAlert | undefined = () => undefined): AlertEntry[] {
  return entriesIn(sources, meIn, choice, now, own, deviceZone());
}
