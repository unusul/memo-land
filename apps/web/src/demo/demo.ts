import { InMemoryBackend, addItem, listActivityId, newActivity, toggleItem } from '@attivita/core';
import type { Activity, Group, Props } from '@attivita/core';
import { appHome } from '../appHome.js';
import { addDays, instantNow, newId, today } from '../dates.js';
import { memoryOutboxStore } from '../offline/outbox.js';
import type { OpenedSession } from '../session/session.js';

/**
 * The demo: a whole app to try with sample data, from the sign-in page or the settings. Everything lives in this
 * page's memory and nothing reaches a server; each opening starts clean. It is reached through the `demo` parameter of
 * the address, so a reload restarts it and leaving it is going back to the app's address.
 */
export const DEMO_ACCOUNT = 'tu@esempio.it';
const ANNA = 'anna@esempio.it';
const MARCO = 'marco@esempio.it';
const DOMAIN = 'esempio.it';

export const isDemoUrl = (search: string = window.location.search): boolean => new URLSearchParams(search).has('demo');
export const startDemo = (): void => window.location.assign(`${appHome()}?demo=1`);
export const leaveDemo = (): void => window.location.assign(appHome());

const TZ = 'Europe/Rome';
const PERSONAL: Group = { id: `personal:${DEMO_ACCOUNT}`, kind: 'personal', name: 'Personale', ownerId: DEMO_ACCOUNT, timeZone: TZ, members: { [DEMO_ACCOUNT]: 'owner' }, version: 1 };
const WORK: Group = { id: `domain:${DOMAIN}`, kind: 'domain', name: DOMAIN, domain: DOMAIN, timeZone: TZ, members: { [DEMO_ACCOUNT]: 'member', [ANNA]: 'member' }, version: 1 };
const HOME: Group = { id: 'demo:casa', kind: 'invite', type: 'activities', name: 'Casa', ownerId: DEMO_ACCOUNT, timeZone: TZ, members: { [DEMO_ACCOUNT]: 'owner', [ANNA]: 'member', [MARCO]: 'guest' }, version: 1 };
const SHOPPING: Group = { id: 'demo:spesa', kind: 'invite', type: 'list', name: 'Spesa', ownerId: ANNA, timeZone: TZ, members: { [ANNA]: 'owner', [DEMO_ACCOUNT]: 'member' }, version: 1 };

const WEEKDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const weekdayIn = (days: number) => WEEKDAY[new Date(`${addDays(today(), days)}T12:00`).getDay()];
const day = (days: number) => addDays(today(), days);
const weekly = (days: number) => ({ mode: 'calendar' as const, rrule: `FREQ=WEEKLY;BYDAY=${weekdayIn(days)}` });

function sampleActivities(now: string): Activity[] {
  const mk = (title: string, groupId: string | null, props: Props = {}, by = DEMO_ACCOUNT, body = ''): Activity =>
    ({ ...newActivity({ id: newId(), accountId: by, title, body, groupId }, now), props });
  let market = mk('Spesa al mercato', PERSONAL.id, { schedule: { start: `${day(3)}T09:00` }, repeat: weekly(3) });
  for (const t of ['pane', 'mele', 'latte']) market = addItem(market, t, DEMO_ACCOUNT, now);
  market = toggleItem(market, market.checklist!.items[2]!.id, DEMO_ACCOUNT, now);
  let shopping = { ...newActivity({ id: listActivityId(SHOPPING), accountId: ANNA, title: SHOPPING.name, groupId: SHOPPING.id }, now) };
  for (const t of ['latte', 'uova', 'pomodori', 'parmigiano', 'caffè']) shopping = addItem(shopping, t, ANNA, now);
  shopping = toggleItem(shopping, shopping.checklist!.items[0]!.id, ANNA, now);
  return [
    mk("Rinnovare l'assicurazione dell'auto", PERSONAL.id, { due: day(-2) }),
    mk('Pagare la bolletta della luce', PERSONAL.id, { due: day(0) }),
    mk('Chiamare il dentista', PERSONAL.id, { due: day(1) }),
    mk('Palestra', PERSONAL.id, { schedule: { start: `${day(1)}T18:30`, end: `${day(1)}T19:30` }, repeat: weekly(1) }),
    market,
    mk('Cambiare il filtro della cappa', PERSONAL.id, { due: day(9), repeat: { mode: 'fromCompletion', every: { unit: 'month', count: 3 } } }),
    mk('Corso di fotografia', PERSONAL.id, {}, DEMO_ACCOUNT, 'Cercare corsi serali in zona.'),
    mk('Riunione settimanale', WORK.id, { schedule: { start: `${day(0)}T10:00`, end: `${day(0)}T11:00` }, repeat: weekly(0) }, ANNA),
    mk('Preparare il report mensile', WORK.id, { due: day(4), assignment: { state: 'accepted', assignee: DEMO_ACCOUNT, assignedBy: ANNA } }, ANNA),
    mk('Aggiornare il contratto del fornitore', WORK.id, { waitingFor: { condition: "firma dell'ufficio legale" } }, ANNA),
    mk('Portare fuori la differenziata', HOME.id, { due: day(0), assignment: { state: 'proposed', assignee: DEMO_ACCOUNT, assignedBy: ANNA } }, ANNA),
    mk('Pulizie di casa', HOME.id, { schedule: { start: `${day(2)}T09:00`, end: `${day(2)}T11:00` }, repeat: weekly(2) }, ANNA),
    mk('Prenotare le vacanze', HOME.id, {}, DEMO_ACCOUNT, 'Mare o montagna? Decidere entro fine mese.'),
    mk('Riparare la mensola', HOME.id, { due: day(5) }, MARCO),
    shopping,
    mk('Regalo per il compleanno di Anna', null),
  ];
}

/** Keys this browser keeps per account (pinned groups, shortcuts): the demo account's are wiped, so the demo starts clean. */
function wipeDemoPrefs(): void {
  try {
    const mine = Object.keys(localStorage).filter(k => k.endsWith(`:${DEMO_ACCOUNT}`));
    for (const k of mine) localStorage.removeItem(k);
  } catch { /* storage unavailable: nothing to wipe */ }
}

export function openDemoSession(): OpenedSession {
  wipeDemoPrefs();
  const backend = new InMemoryBackend();
  for (const g of [PERSONAL, WORK, HOME, SHOPPING]) backend.groups.set(g.id, structuredClone(g));
  for (const a of sampleActivities(instantNow())) backend.activities.set(a.id, a);
  const engine = backend.session(DEMO_ACCOUNT);
  return {
    account: DEMO_ACCOUNT, primary: engine, engines: [engine], personalGroupId: PERSONAL.id, outbox: memoryOutboxStore(),
    signOut: async () => leaveDemo(), demo: true,
  };
}
