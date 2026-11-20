import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
import { newActivity } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { alertBlock } from '../src/activity/AlertButton.js';
import { alertsOf, setActivityAlert } from '../src/groups/barPrefs.js';
import { SettingsView } from '../src/settings/SettingsView.js';
import { Shell } from '../src/shell/Shell.js';
import { NO_GENERAL, alertWords, alertsFor } from '../src/telegram/alerts.js';
import { openedFrom } from '../src/shell/notificationTap.js';
import type { Alert } from '../src/telegram/alerts.js';
import { refreshTelegram, resetTelegram } from '../src/telegram/state.js';
import type { TelegramStatus, TelegramStore } from '../src/telegram/store.js';
import { whenLabel, whichAlert } from '../src/telegram/TelegramSection.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

afterEach(() => resetTelegram());

const casa: Group = { id: 'inv:casa', kind: 'invite', name: 'Casa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner', [PLUTO]: 'member' }, version: 1 };
const at = (id: string, title: string, props: Activity['props']): Activity =>
  ({ ...newActivity({ id, accountId: PIPPO, title, groupId: casa.id }, '2026-11-01T08:00:00Z'), props });
const local = (t: string) => new Date(t).toISOString();

/**
 * The alerts of the next days (user's choices, 2026-11-18): at the start of what has a time, at the end of what has
 * one, for what is the person's or nobody's; not for someone else's, a date without a time, or what is already past.
 */
test('testAlertsOfTheNextDays', () => {
  const now = new Date('2026-11-18T10:00');
  const sources = [{ group: casa, activities: [
    at('riunione', 'Riunione', { schedule: { start: '2026-11-18T18:00', end: '2026-11-18T19:00' } }),
    at('bolletta', 'Bolletta', { due: '2026-11-19T12:00' }),
    at('sua', 'Di Pluto', { schedule: { start: '2026-11-18T15:00' }, assignment: { state: 'accepted', assignee: PLUTO, assignedBy: PIPPO } }),
    at('giorno', 'Tutto il giorno', { due: '2026-11-18' }),
    at('passata', 'Passata', { schedule: { start: '2026-11-18T09:00' } }),
    at('lontana', 'Lontana', { schedule: { start: '2026-12-30T09:00' } }),
  ] }];
  const me = () => PIPPO;
  expect(alertsFor(sources, me, { start: true, end: true }, now)).toEqual<Alert[]>([
    { at: local('2026-11-18T18:00'), text: 'Ora, 18:00: Riunione · Casa' },
    { at: local('2026-11-18T19:00'), text: 'Finisce ora, 19:00: Riunione · Casa' },
    { at: local('2026-11-19T12:00'), text: 'Scade ora, 12:00: Bolletta · Casa' },
  ]);
  expect(alertsFor(sources, me, { start: true, end: false }, now).map(a => a.text)).toEqual(['Ora, 18:00: Riunione · Casa', 'Scade ora, 12:00: Bolletta · Casa']);
  expect(alertsFor(sources, me, { start: false, end: false }, now)).toEqual([]);
  expect(alertsFor(sources, () => PLUTO, { start: true, end: false }, now).map(a => a.text)).toContain('Ora, 15:00: Di Pluto · Casa');
});

/** A server in memory, as migrations 0009 and 0010 behave. */
function fakeTelegram(configured = true): TelegramStore & { state: TelegramStatus; tests: number; devices: string[] } {
  const f = {
    state: { configured, bot: configured ? 'memo_land_bot' : null, linked: false, on: true } as TelegramStatus,
    tests: 0,
    devices: [] as string[],
    status: async () => ({ ...f.state }),
    linkCode: async () => (configured ? { code: 'abc123', bot: 'memo_land_bot' } : null),
    setOn: async (on: boolean) => { f.state = { ...f.state, on }; },
    unlink: async () => { f.state = { ...f.state, linked: false }; },
    test: async () => { f.tests++; return { telegram: f.state.linked && f.state.on !== false, devices: f.devices.length }; },
    subscribePush: async (k: { endpoint: string }) => { f.devices.push(k.endpoint); },
    unsubscribePush: async (endpoint: string) => { f.devices = f.devices.filter(d => d !== endpoint); },
  };
  return f;
}

/** The alerts set in the bell's panel, in words (the add rows left out). */
const set = (panel: HTMLElement) => within(panel).getAllByRole('listitem').filter(li => !li.classList.contains('alert-new') && !li.classList.contains('alert-none')).map(li => li.textContent);
/** The + of the add rows, by name. */
const adds = (panel: HTMLElement) => within(panel).getAllByRole('button', { name: /^Aggiungi / }).map(b => b.getAttribute('aria-label'));

async function openSettings(store: TelegramStore, backend = benchBackend()) {
  await refreshTelegram(store);
  renderWithSession(<SettingsView />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  return screen.findByRole('group', { name: 'Avvisi' });
}

/**
 * Collega Telegram gives the bot's link with a code; once the bot has tied the chat, its switch, Manda una prova (sent
 * by the server since 2026-11-19), Prossime notifiche and Scollega. The switch off, no channel is on: no test and no
 * list. Before, the section was «Avvisi su Telegram» and the test went through the queue the app filled.
 */
test('testLinkTestAndUnlinkTelegram', async () => {
  const store = fakeTelegram();
  const box = await openSettings(store);
  fireEvent.click(within(box).getByRole('button', { name: 'Collega Telegram' }));
  const open = await within(box).findByRole('link', { name: 'Apri Telegram' });
  expect(open.getAttribute('href')).toBe('https://t.me/memo_land_bot?start=abc123');
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  const telegram = await within(box).findByRole('switch', { name: 'Telegram' });
  expect(telegram.getAttribute('aria-checked')).toBe('true');
  const upcoming = within(box).getByRole('group', { name: 'Prossime notifiche' });
  expect(within(upcoming).getByText(/Nessuna nei prossimi 7 giorni/)).toBeTruthy();
  expect(within(upcoming).getByText(/Partono dal server anche ad app chiusa, su Telegram/)).toBeTruthy();
  fireEvent.click(within(box).getByRole('button', { name: 'Manda una prova' }));
  expect(await within(box).findByText('Inviata su Telegram')).toBeTruthy();
  expect(store.tests).toBe(1);
  fireEvent.click(telegram);
  await waitFor(() => expect(within(box).queryByRole('group', { name: 'Prossime notifiche' })).toBeNull());
  expect(store.state.on).toBe(false);
  expect(within(box).queryByRole('button', { name: 'Manda una prova' })).toBeNull();
  fireEvent.click(within(box).getByRole('button', { name: 'Altro su Telegram' }));
  fireEvent.click(within(box).getByRole('menuitem', { name: 'Scollega Telegram' }));
  expect(await within(box).findByRole('button', { name: 'Collega Telegram' })).toBeTruthy();
});

/** Without the bot set up on the server it says so; in the demo, without a server, there is no section. */
test('testTelegramWithoutBotOrServer', async () => {
  const box = await openSettings(fakeTelegram(false));
  expect(within(box).getByText(/non è ancora configurato/)).toBeTruthy();
  expect(within(box).queryByRole('button', { name: 'Collega Telegram' })).toBeNull();
});

test('testNoTelegramSectionWithoutServer', () => {
  renderWithSession(<SettingsView />, memorySession(PIPPO));
  expect(screen.queryByRole('group', { name: 'Avvisi' })).toBeNull();
});

/**
 * The server computes and sends the alerts (alerts-tick, 2026-11-19): the app only reads where Telegram stands when it
 * opens. Before, a moment after it opened, it handed the server the alerts of the next days.
 */
test('testTheAppNoLongerHandsAlertsToTheServer', async () => {
  const store = fakeTelegram();
  let read = 0;
  renderWithSession(<Shell />, { ...memorySession(PIPPO), telegram: { ...store, status: async () => { read++; return store.status(); } } });
  await waitFor(() => expect(read).toBe(1));
  expect('replaceQueue' in store).toBe(false);
});

/**
 * An activity's own alerts (2026-11-18, decided while the user was away): in place of Impostazioni's, one more before
 * the start, and for someone else's activity too; «Nessun avviso» silences it, before included.
 */
test('testAnActivitysOwnAlerts', () => {
  const now = new Date('2026-11-18T10:00');
  const sources = [{ group: casa, activities: [
    at('sua', 'Di Pluto', { schedule: { start: '2026-11-18T15:00', end: '2026-11-18T16:00' }, assignment: { state: 'accepted', assignee: PLUTO, assignedBy: PIPPO } }),
    at('zitta', 'Zitta', { schedule: { start: '2026-11-18T17:00' } }),
  ] }];
  const own = (id: string) => ({ sua: { when: 'end' as const, before: 30 as const }, zitta: { when: 'none' as const, before: 10 as const } })[id];
  expect(alertsFor(sources, () => PIPPO, { start: true, end: false }, now, own)).toEqual<Alert[]>([
    { at: local('2026-11-18T14:30'), text: 'Tra 30 minuti, 15:00: Di Pluto · Casa' },
    { at: local('2026-11-18T16:00'), text: 'Finisce ora, 16:00: Di Pluto · Casa' },
  ]);
});

/**
 * The user's example (2026-11-18): start 20 minutes before and end 15 minutes before, chosen in the bell's panel.
 * And a choice saved by 0.16.0 ({ when, before }) still read.
 */
test('testAListOfAlertsBeforeStartAndEnd', () => {
  const now = new Date('2026-11-18T10:00');
  const sources = [{ group: casa, activities: [at('riunione', 'Riunione', { schedule: { start: '2026-11-18T18:00', end: '2026-11-18T19:00' } })] }];
  const own = () => ({ mode: 'here' as const, list: [{ of: 'start' as const, before: 20 }, { of: 'end' as const, before: 15 }, { of: 'start' as const, before: 1440 }] });
  expect(alertsFor(sources, () => PIPPO, { start: true, end: false }, now, own)).toEqual<Alert[]>([
    { at: local('2026-11-18T17:40'), text: 'Tra 20 minuti, 18:00: Riunione · Casa' },
    { at: local('2026-11-18T18:45'), text: 'Finisce tra 15 minuti, 19:00: Riunione · Casa' },
  ]);
  const tomorrow = [{ group: casa, activities: [at('domani', 'Domani', { schedule: { start: '2026-11-19T18:00' } })] }];
  expect(alertsFor(tomorrow, () => PIPPO, { start: false, end: false }, now, () => ({ mode: 'here' as const, list: [{ of: 'start' as const, before: 1440 }, { of: 'start' as const, before: 120 }] })).map(a => a.text))
    .toEqual(['Domani, 18:00: Domani · Casa', 'Tra 2 ore, 18:00: Domani · Casa']);
});

/**
 * The bell opens a panel (user's choices, 2026-11-18/19): the alerts in words, each with its ×, and a dashed row that
 * adds one: «all'inizio», «prima dell'inizio» with how long, «alla fine», «prima della fine». The changes go all
 * together with ✓, and Esc drops them (user's request, 2026-11-19; before, each one was kept at once); the bell lit, its
 * hint saying what is set. Before, rows of fields with «0 minuti all'ora esatta»
 * and ✓, under «Come in Impostazioni / Scelti qui / Nessuno». Not without a Telegram store.
 */
test('testTheBellOpensAPanelOfAlerts', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('riunione', { ...at('riunione', 'Riunione', { schedule: { start: '2999-01-01T18:00', end: '2999-01-01T19:00' } }), groupId: 'inv:developers' });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  const { unmount } = renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Riunione' });
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi' }));
  const panel = screen.getByRole('dialog', { name: 'Avvisi' });
  expect(within(panel).getByText('Nessun avviso')).toBeTruthy();
  fireEvent.change(within(panel).getByRole('textbox', { name: "Quanto prima dell'inizio" }), { target: { value: '20' } });
  fireEvent.click(within(panel).getByRole('button', { name: "Aggiungi prima dell'inizio" }));
  fireEvent.change(within(panel).getByRole('textbox', { name: 'Quanto prima della fine' }), { target: { value: '15' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi prima della fine' }));
  // Nothing kept until ✓ (user's request, 2026-11-19): the changes go all together.
  expect(alertsOf(PIPPO)['riunione']).toBeUndefined();
  expect(set(panel)).toEqual(["20 minuti prima dell'inizio", '15 minuti prima della fine']);
  fireEvent.click(within(panel).getByRole('button', { name: 'Applica' }));
  expect(alertsOf(PIPPO)['riunione']).toEqual({ mode: 'here', list: [{ of: 'start', before: 20 }, { of: 'end', before: 15 }] });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Avvisi' })).toBeNull());
  const bell = screen.getByRole('button', { name: 'Avvisi' });
  expect(bell.className).toContain(' on');
  expect(bell.getAttribute('title')).toBe('Avvisi: inizio −20 min, fine −15 min');
  // Each × takes one away; with none left the activity has no alerts and the bell is no longer lit.
  fireEvent.click(bell);
  const again = screen.getByRole('dialog', { name: 'Avvisi' });
  fireEvent.click(within(again).getByRole('button', { name: "Togli 20 minuti prima dell'inizio" }));
  fireEvent.click(within(again).getByRole('button', { name: 'Togli 15 minuti prima della fine' }));
  expect(within(again).getByText('Nessun avviso')).toBeTruthy();
  // Esc drops what was changed: the two alerts are still there.
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Avvisi' })).toBeNull());
  expect(alertsOf(PIPPO)['riunione']?.list).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi' }));
  const third = screen.getByRole('dialog', { name: 'Avvisi' });
  fireEvent.click(within(third).getByRole('button', { name: "Togli 20 minuti prima dell'inizio" }));
  fireEvent.click(within(third).getByRole('button', { name: 'Togli 15 minuti prima della fine' }));
  fireEvent.click(within(third).getByRole('button', { name: 'Applica' }));
  expect(alertsOf(PIPPO)['riunione']).toBeUndefined();
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avvisi' }).className).not.toContain(' on'));
  unmount();
  renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findByRole('heading', { name: 'Riunione' });
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi' }));
  expect(within(screen.getByRole('dialog', { name: 'Avvisi' })).getByText(/non sono disponibili/)).toBeTruthy();
});

/**
 * The «Avvisi» row under the properties (user's request, 2026-11-19): «Imposta» with no alerts, the alerts in words
 * once set, and a tap opens the bell's panel; no row on an activity without a date, where the bell stays.
 */
test('testTheAlertRowOfTheDetail', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('riunione', { ...at('riunione', 'Riunione', { schedule: { start: '2999-01-01T18:00', end: '2999-01-01T19:00' } }), groupId: 'inv:developers' });
  backend.activities.set('idea', { ...at('idea', 'Idea regalo', {}), groupId: 'inv:developers' });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  const { unmount } = renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Riunione' });
  const row = screen.getByRole('button', { name: 'Modifica Avvisi' });
  expect(row.textContent).toBe('Imposta');
  fireEvent.click(row);
  const panel = screen.getByRole('dialog', { name: 'Avvisi' });
  fireEvent.change(within(panel).getByRole('textbox', { name: "Quanto prima dell'inizio" }), { target: { value: '15' } });
  fireEvent.click(within(panel).getByRole('button', { name: "Aggiungi prima dell'inizio" }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi alla fine' }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Applica' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Avvisi' })).toBeNull());
  expect(screen.getByRole('button', { name: 'Modifica Avvisi' }).textContent).toBe("15 minuti prima dell'inizio, alla fine");
  unmount();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Idea regalo' });
  expect(screen.queryByRole('button', { name: 'Modifica Avvisi' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Avvisi' })).toBeTruthy();
});

/**
 * The bell is on every activity (user's request, 2026-11-19); when alerts cannot be set its panel says why, in place
 * of the list. Before, the bell was simply missing.
 */
test('testTheBellSaysWhyItCannot', () => {
  const linked: TelegramStatus = { configured: true, bot: 'b', linked: true, on: true };
  expect(alertBlock(false, linked, true)).toMatch(/non sono disponibili/);
  expect(alertBlock(true, undefined, true)).toMatch(/Controllo/);
  expect(alertBlock(true, null, true)).toMatch(/non risponde/);
  expect(alertBlock(true, { ...linked, configured: false }, true)).toMatch(/Nessun canale acceso/);
  expect(alertBlock(true, { ...linked, linked: false }, true)).toMatch(/Nessun canale acceso/);
  expect(alertBlock(true, { ...linked, on: false }, true)).toMatch(/Nessun canale acceso/);
  expect(alertBlock(true, linked, false)).toMatch(/non ha una data/);
  expect(alertBlock(true, linked, true)).toBeNull();
  // The notifications of this device are a channel too (2026-11-19): enough without Telegram.
  expect(alertBlock(true, { ...linked, linked: false }, true, true)).toBeNull();
  expect(alertBlock(true, null, true, true)).toBeNull();
  // A draft is in no group: no alerts there (user's choice, 2026-11-19; before, the bell set alerts that never went).
  expect(alertBlock(true, linked, true, true, true)).toMatch(/Le bozze non hanno avvisi/);
});

/** Without a duration there is no end: only the two on the start. */
test('testNoAlertsOnTheEndWithoutADuration', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('call', { ...at('call', 'Chiamata', { schedule: { start: '2999-01-01T18:00' } }), groupId: 'inv:developers' });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  renderWithSession(<ActivityDetail activityId="call" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Chiamata' });
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi' }));
  expect(adds(screen.getByRole('dialog', { name: 'Avvisi' }))).toEqual(["Aggiungi all'inizio", "Aggiungi prima dell'inizio"]);
});

/**
 * Only what the bell sets alerts (user's choice, 2026-11-19), and Prossime notifiche lists it as it will reach Telegram,
 * with when it leaves. Before, an activity with a time alerted at its start by itself.
 */
test('testOnlyTheBellAlertsAndTheSettingsListThem', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('a', { ...at('a', 'Con avviso', { schedule: { start: '2999-01-01T18:00' } }), groupId: 'inv:developers' });
  backend.activities.set('b', { ...at('b', 'Senza avviso', { schedule: { start: '2999-01-01T19:00' } }), groupId: 'inv:developers' });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2998-12-31T10:00'));
  try {
    setActivityAlert(PIPPO, 'a', { mode: 'here', list: [{ of: 'start', before: 30 }] });
    const box = await openSettings(store, backend);
    const list = within(box).getByRole('group', { name: 'Prossime notifiche' });
    const rows = await within(list).findAllByRole('listitem');
    expect(rows.map(r => r.textContent)).toEqual(["domani 18:00 · Con avviso · developersavviso 30 minuti prima dell'inizio"]);
  } finally {
    vi.useRealTimers();
  }
  // Impostazioni with the two channels, under the whole suite: up to 5 s on this PC (2026-11-19).
}, 10_000);

test('testWhichAlert', () => {
  expect(whichAlert({ of: 'start', before: 0 })).toBe("avviso all'inizio");
  expect(whichAlert({ of: 'end', before: 0 })).toBe('avviso alla fine');
  expect(whichAlert({ of: 'start', before: 15 })).toBe("avviso 15 minuti prima dell'inizio");
  expect(whichAlert({ of: 'end', before: 60 })).toBe('avviso 1 ora prima della fine');
  expect(whichAlert({ of: 'start', before: 1440 })).toBe("avviso 1 giorno prima dell'inizio");
});

test('testWhenLabel', () => {
  const now = new Date('2026-11-19T10:00');
  expect(whenLabel(new Date('2026-11-19T16:15').toISOString(), now)).toBe('oggi 16:15');
  expect(whenLabel(new Date('2026-11-20T08:05').toISOString(), now)).toBe('domani 08:05');
  expect(whenLabel(new Date('2026-11-21T15:00').toISOString(), now)).toBe('sab 21, 15:00');
});

/**
 * A date without an hour (user's choice, 2026-11-19): alerts on its day or some days before, at an hour chosen. Before,
 * the bell could not be used there. With an hour, a day alert still counts.
 */
test('testDayAlertsOnADateWithoutAnHour', () => {
  const bolletta = { ...at('bolletta', 'Bolletta', { due: '2026-11-21' }), groupId: casa.id };
  const riunione = { ...at('riunione', 'Riunione', { schedule: { start: '2026-11-21T18:00' } }), groupId: casa.id };
  const sources = [{ group: casa, activities: [bolletta, riunione] }];
  const own = (id: string) => ({ mode: 'here' as const, list: id === 'bolletta'
    ? [{ of: 'day' as const, before: 1, at: '18:00' }, { of: 'day' as const, before: 0, at: '09:00' }, { of: 'start' as const, before: 0 }]
    : [{ of: 'day' as const, before: 0, at: '08:30' }] });
  const now = new Date('2026-11-19T10:00');
  expect(alertsFor(sources, () => PIPPO, NO_GENERAL, now, own)).toEqual<Alert[]>([
    { at: local('2026-11-20T18:00'), text: 'Scade domani: Bolletta · Casa' },
    { at: local('2026-11-21T08:30'), text: 'Oggi, 18:00: Riunione · Casa' },
    { at: local('2026-11-21T09:00'), text: 'Scade oggi: Bolletta · Casa' },
  ]);
  expect(alertWords({ of: 'day', before: 0, at: '09:00' })).toBe('il giorno stesso alle 9:00');
  expect(alertWords({ of: 'day', before: 1, at: '18:00' })).toBe('il giorno prima alle 18:00');
  expect(alertWords({ of: 'day', before: 3, at: '18:30' })).toBe('3 giorni prima alle 18:30');
  expect(whenLabel('2026-11-21', now)).toBe('sab 21');
});

/** The panel of a date without an hour: «il giorno stesso» or «giorni prima», «alle» an hour every half hour. */
test('testTheBellOnADateWithoutAnHour', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('bolletta', { ...at('bolletta', 'Bolletta', { due: '2999-01-02' }), groupId: 'inv:developers' });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  renderWithSession(<ActivityDetail activityId="bolletta" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Bolletta' });
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi' }));
  const panel = screen.getByRole('dialog', { name: 'Avvisi' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi il giorno stesso' }));
  fireEvent.change(within(panel).getByRole('textbox', { name: 'Quanti giorni prima' }), { target: { value: '2' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Ora giorni prima' }));
  // The hours float over the page as the other menus (2026-11-20).
  fireEvent.click(within(screen.getByRole('menu', { name: 'Ora giorni prima' })).getByRole('menuitemradio', { name: '18:30' }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi giorni prima' }));
  expect(set(panel)).toEqual(['2 giorni prima alle 18:30', 'il giorno stesso alle 10:00']);
  fireEvent.click(within(panel).getByRole('button', { name: 'Applica' }));
  expect(alertsOf(PIPPO)['bolletta']).toEqual({ mode: 'here', list: [{ of: 'day', before: 2, at: '18:30' }, { of: 'day', before: 0, at: '10:00' }] });
});

/** A tap on a notification opens its activity (2026-11-19): the address the service worker opens says which. */
test('testANotificationTapNamesTheActivity', () => {
  expect(openedFrom('?activity=riunione&occurrence=2026-11-20T18%3A45')).toEqual({ activityId: 'riunione', occurrenceKey: '2026-11-20T18:45' });
  expect(openedFrom('?activity=idea')).toEqual({ activityId: 'idea' });
  expect(openedFrom('?capture=1')).toBeNull();
});

/**
 * A draft has no alerts (user's choice, 2026-11-19): the bell says to move it into a group and the detail has no
 * «Avvisi» row. Before, the bell set alerts on a draft that never went, as the alerts are computed from the groups.
 */
test('testADraftHasNoAlerts', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('bozza', { ...at('bozza', 'Test', { schedule: { start: '2999-01-01T16:35' } }), groupId: null });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  renderWithSession(<ActivityDetail activityId="bozza" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Test' });
  expect(screen.queryByRole('button', { name: 'Modifica Avvisi' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi' }));
  expect(within(screen.getByRole('dialog', { name: 'Avvisi' })).getByText(/Le bozze non hanno avvisi/)).toBeTruthy();
});

/**
 * One open row per kind, each with its + (user's choice, 2026-11-19, «metti tutto aperto»); «all'inizio» and «alla
 * fine», once in the list, have no row any more; the «prima…» rows stay, as another amount is another alert. Before, a
 * «Quando» menu, which offered them again, and one «+ Aggiungi».
 */
test('testTheBellOffersStartAndEndOnce', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('riunione', { ...at('riunione', 'Riunione', { schedule: { start: '2999-01-01T18:00', end: '2999-01-01T19:00' } }), groupId: 'inv:developers' });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Riunione' });
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi' }));
  const panel = screen.getByRole('dialog', { name: 'Avvisi' });
  fireEvent.click(within(panel).getByRole('button', { name: "Aggiungi all'inizio" }));
  expect(adds(panel)).toEqual(["Aggiungi prima dell'inizio", 'Aggiungi alla fine', 'Aggiungi prima della fine']);
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi alla fine' }));
  expect(adds(panel)).toEqual(["Aggiungi prima dell'inizio", 'Aggiungi prima della fine']);
  expect(set(panel)).toEqual(["all'inizio", 'alla fine']);
});

/**
 * Fewer words (user's remarks, 2026-11-20): the detail's row says «3 avvisi» from three on; an add row changed and not
 * added is marked, and after its + it goes back to how it started; a new day alert starts at 10:00.
 */
test('testTheAlertRowCountsAndAChangedRowIsMarked', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('spid', { ...at('spid', 'Scadenza Spid', { due: '2999-12-10' }), groupId: 'inv:developers' });
  const store = fakeTelegram();
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  renderWithSession(<ActivityDetail activityId="spid" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Scadenza Spid' });
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Avvisi' }));
  const panel = screen.getByRole('dialog', { name: 'Avvisi' });
  expect(within(panel).getByRole('button', { name: 'Ora il giorno stesso' }).textContent).toBe('10:00 ▾');
  const days = within(panel).getByRole('textbox', { name: 'Quanti giorni prima' });
  const row = days.closest('li')!;
  expect(row.className).not.toContain('edited');
  for (const n of ['14', '7', '2']) {
    fireEvent.change(days, { target: { value: n } });
    expect(row.className).toContain('edited');
    fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi giorni prima' }));
    expect(row.className).not.toContain('edited');
    expect((days as HTMLInputElement).value).toBe('1');
  }
  fireEvent.click(within(panel).getByRole('button', { name: 'Applica' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Modifica Avvisi' }).textContent).toBe('3 avvisi'));
});
