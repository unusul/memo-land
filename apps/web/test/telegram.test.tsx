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
import type { Alert } from '../src/telegram/alerts.js';
import { refreshTelegram, resetTelegram } from '../src/telegram/state.js';
import type { TelegramStatus, TelegramStore } from '../src/telegram/store.js';
import { whenLabel, whichAlert } from '../src/telegram/TelegramSection.js';
import { PIPPO, PLUTO, benchBackend, chooseIn, memorySession, renderWithSession } from './memory-session.js';

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

/** A server in memory, as migration 0009 behaves. */
function fakeTelegram(configured = true): TelegramStore & { state: TelegramStatus; queued: Alert[] } {
  const f = {
    state: { configured, bot: configured ? 'memo_land_bot' : null, linked: false, start: true, end: false } as TelegramStatus,
    queued: [] as Alert[],
    status: async () => ({ ...f.state }),
    linkCode: async () => (configured ? { code: 'abc123', bot: 'memo_land_bot' } : null),
    setAlerts: async (c: { start: boolean; end: boolean }) => { f.state = { ...f.state, ...c }; },
    unlink: async () => { f.state = { ...f.state, linked: false }; f.queued = []; },
    replaceQueue: async (alerts: Alert[]) => { f.queued = alerts; return alerts.length; },
  };
  return f;
}

async function openSettings(store: TelegramStore, backend = benchBackend()) {
  await refreshTelegram(store);
  renderWithSession(<SettingsView />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  return screen.findByRole('group', { name: 'Avvisi su Telegram' });
}

/**
 * Collega Telegram gives the bot's link with a code; once the bot has tied the chat, Manda una prova, Prossime
 * notifiche and Scollega. No switches for alerts of every activity (user's choice, 2026-11-19): before, «All'inizio»
 * and «Alla fine» made everything with a time alert; now only the bell does.
 */
test('testLinkTestAndUnlinkTelegram', async () => {
  const store = fakeTelegram();
  const box = await openSettings(store);
  fireEvent.click(within(box).getByRole('button', { name: 'Collega Telegram' }));
  const open = await within(box).findByRole('link', { name: 'Apri Telegram' });
  expect(open.getAttribute('href')).toBe('https://t.me/memo_land_bot?start=abc123');
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  expect(await within(box).findByText(/Collegato/)).toBeTruthy();
  expect(within(box).queryByRole('checkbox')).toBeNull();
  expect(within(within(box).getByRole('group', { name: 'Prossime notifiche' })).getByText(/Nessuna nei prossimi 7 giorni/)).toBeTruthy();
  fireEvent.click(within(box).getByRole('button', { name: 'Manda una prova' }));
  expect(await within(box).findByText('Inviata: arriva entro un minuto')).toBeTruthy();
  expect(store.queued.map(a => a.text)).toEqual(['Prova da memo-land: gli avvisi arrivano qui.']);
  expect(new Date(store.queued[0]!.at).getTime()).toBeGreaterThan(Date.now());
  fireEvent.click(within(box).getByRole('button', { name: 'Scollega Telegram' }));
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
  expect(screen.queryByRole('group', { name: 'Avvisi su Telegram' })).toBeNull();
});

/** With a chat tied, the app hands the server the alerts of the next days a moment after it opens; not without one. */
test('testTheAppHandsTheAlertsToTheServer', async () => {
  const store = fakeTelegram();
  let calls = 0;
  const counted = { ...store, replaceQueue: async (a: Alert[]) => { calls++; return store.replaceQueue(a); } };
  store.state = { ...store.state, linked: true };
  renderWithSession(<Shell />, { ...memorySession(PIPPO), telegram: counted });
  await waitFor(() => expect(calls).toBe(1), { timeout: 6000 });
  resetTelegram();
  store.state = { ...store.state, linked: false };
  calls = 0;
}, 10_000);

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
 * adds one: «all'inizio», «prima dell'inizio» with how long, «alla fine», «prima della fine». Each change is kept at
 * once for the person; the bell lit, its hint saying what is set. Before, rows of fields with «0 minuti all'ora esatta»
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
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi su Telegram' }));
  const panel = screen.getByRole('dialog', { name: 'Avvisi su Telegram' });
  expect(within(panel).getByText('Nessun avviso')).toBeTruthy();
  expect(within(panel).queryByRole('textbox')).toBeNull();
  chooseIn('Quando', 'beforeStart');
  fireEvent.change(within(panel).getByRole('textbox', { name: 'Quanto prima' }), { target: { value: '20' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi' }));
  chooseIn('Quando', 'beforeEnd');
  fireEvent.change(within(panel).getByRole('textbox', { name: 'Quanto prima' }), { target: { value: '15' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi' }));
  expect(alertsOf(PIPPO)['riunione']).toEqual({ mode: 'here', list: [{ of: 'start', before: 20 }, { of: 'end', before: 15 }] });
  expect(within(panel).getAllByRole('listitem').map(li => li.textContent)).toEqual(["20 minuti prima dell'inizio", '15 minuti prima della fine']);
  fireEvent.click(within(panel).getByRole('button', { name: 'Chiudi' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Avvisi su Telegram' })).toBeNull());
  const bell = screen.getByRole('button', { name: 'Avvisi su Telegram' });
  expect(bell.className).toContain(' on');
  expect(bell.getAttribute('title')).toBe('Avvisi: inizio −20 min, fine −15 min');
  // Each × takes one away; with none left the activity has no alerts and the bell is no longer lit.
  fireEvent.click(bell);
  const again = screen.getByRole('dialog', { name: 'Avvisi su Telegram' });
  fireEvent.click(within(again).getByRole('button', { name: "Togli 20 minuti prima dell'inizio" }));
  fireEvent.click(within(again).getByRole('button', { name: 'Togli 15 minuti prima della fine' }));
  expect(alertsOf(PIPPO)['riunione']).toBeUndefined();
  expect(within(again).getByText('Nessun avviso')).toBeTruthy();
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Avvisi su Telegram' }).className).not.toContain(' on'));
  unmount();
  renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findByRole('heading', { name: 'Riunione' });
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi su Telegram' }));
  expect(within(screen.getByRole('dialog', { name: 'Avvisi su Telegram' })).getByText(/non sono disponibili/)).toBeTruthy();
});

/**
 * The bell is on every activity (user's request, 2026-11-19); when alerts cannot be set its panel says why, in place
 * of the list. Before, the bell was simply missing.
 */
test('testTheBellSaysWhyItCannot', () => {
  const linked: TelegramStatus = { configured: true, bot: 'b', linked: true, start: false, end: false };
  expect(alertBlock(false, linked, true)).toMatch(/non sono disponibili/);
  expect(alertBlock(true, undefined, true)).toMatch(/Controllo/);
  expect(alertBlock(true, null, true)).toMatch(/non risponde/);
  expect(alertBlock(true, { ...linked, configured: false }, true)).toMatch(/non è ancora configurato/);
  expect(alertBlock(true, { ...linked, linked: false }, true)).toMatch(/Non hai collegato Telegram/);
  expect(alertBlock(true, linked, false)).toMatch(/non ha una data/);
  expect(alertBlock(true, linked, true)).toBeNull();
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
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi su Telegram' }));
  fireEvent.click(screen.getByRole('button', { name: 'Quando' }));
  expect(within(screen.getByRole('menu', { name: 'Quando' })).getAllByRole('menuitemradio').map(b => b.textContent)).toEqual(["all'inizio", "prima dell'inizio"]);
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
});

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
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi su Telegram' }));
  const panel = screen.getByRole('dialog', { name: 'Avvisi su Telegram' });
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi' }));
  chooseIn('Quando', 'before');
  fireEvent.change(within(panel).getByRole('textbox', { name: 'Quanti giorni prima' }), { target: { value: '2' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Ora' }));
  fireEvent.click(within(within(panel).getByRole('listbox', { name: 'Ore' })).getByRole('option', { name: '18:30' }));
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi' }));
  expect(within(panel).getAllByRole('listitem').map(li => li.textContent)).toEqual(['2 giorni prima alle 18:30', 'il giorno stesso alle 9:00']);
  expect(alertsOf(PIPPO)['bolletta']).toEqual({ mode: 'here', list: [{ of: 'day', before: 2, at: '18:30' }, { of: 'day', before: 0, at: '09:00' }] });
});
