import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { newActivity } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { alertsOf } from '../src/groups/barPrefs.js';
import { SettingsView } from '../src/settings/SettingsView.js';
import { Shell } from '../src/shell/Shell.js';
import { alertsFor } from '../src/telegram/alerts.js';
import type { Alert } from '../src/telegram/alerts.js';
import { refreshTelegram, resetTelegram } from '../src/telegram/state.js';
import type { TelegramStatus, TelegramStore } from '../src/telegram/store.js';
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

async function openSettings(store: TelegramStore) {
  await refreshTelegram(store);
  renderWithSession(<SettingsView />, { ...memorySession(PIPPO), telegram: store });
  return screen.findByRole('group', { name: 'Avvisi su Telegram' });
}

/** Collega Telegram gives the bot's link with a code; once the bot has tied the chat, the choices and Scollega. */
test('testLinkChooseAndUnlinkTelegram', async () => {
  const store = fakeTelegram();
  const box = await openSettings(store);
  fireEvent.click(within(box).getByRole('button', { name: 'Collega Telegram' }));
  const open = await within(box).findByRole('link', { name: 'Apri Telegram' });
  expect(open.getAttribute('href')).toBe('https://t.me/memo_land_bot?start=abc123');
  store.state = { ...store.state, linked: true };
  await refreshTelegram(store);
  expect(await within(box).findByText(/Collegato/)).toBeTruthy();
  fireEvent.click(within(box).getByRole('checkbox', { name: 'Avviso alla fine' }));
  await waitFor(() => expect(store.state.end).toBe(true));
  expect((within(box).getByRole('checkbox', { name: "Avviso all'inizio" }) as HTMLInputElement).checked).toBe(true);
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
 * The bell opens a panel as Ripeti's (user's choice, 2026-11-18; before, a small menu of fixed choices): «Scelti qui»,
 * the rows, «+ Aggiungi avviso», ✓; kept for the person, the bell lit, its hint saying what is set. Not in the demo.
 */
test('testTheBellOpensAPanelOfAlerts', async () => {
  localStorage.clear();
  const backend = benchBackend();
  backend.activities.set('riunione', { ...at('riunione', 'Riunione', { schedule: { start: '2999-01-01T18:00', end: '2999-01-01T19:00' } }), groupId: 'inv:developers' });
  const store = fakeTelegram();
  await refreshTelegram(store);
  const { unmount } = renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, { ...memorySession(PIPPO, {}, backend), telegram: store });
  await screen.findByRole('heading', { name: 'Riunione' });
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi su Telegram' }));
  const panel = screen.getByRole('dialog', { name: 'Avvisi su Telegram' });
  fireEvent.click(within(panel).getByRole('radio', { name: 'Scelti qui' }));
  fireEvent.change(within(panel).getByRole('textbox', { name: 'Quanto prima, avviso 1' }), { target: { value: '20' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Aggiungi avviso' }));
  chooseIn('Quando, avviso 2', 'end');
  fireEvent.change(within(panel).getByRole('textbox', { name: 'Quanto prima, avviso 2' }), { target: { value: '15' } });
  fireEvent.click(within(panel).getByRole('button', { name: 'Applica' }));
  expect(alertsOf(PIPPO)['riunione']).toEqual({ mode: 'here', list: [{ of: 'start', before: 20 }, { of: 'end', before: 15 }] });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Avvisi su Telegram' })).toBeNull());
  const bell = screen.getByRole('button', { name: 'Avvisi su Telegram' });
  expect(bell.className).toContain(' on');
  expect(bell.getAttribute('title')).toBe('Avvisi: inizio −20 min, fine −15 min');
  // Esc gives up; «Come in Impostazioni» gives the activity back.
  fireEvent.click(bell);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Avvisi su Telegram' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Avvisi su Telegram' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Avvisi su Telegram' })).getByRole('radio', { name: 'Come in Impostazioni' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Avvisi su Telegram' })).getByRole('button', { name: 'Applica' }));
  expect(alertsOf(PIPPO)['riunione']).toBeUndefined();
  unmount();
  renderWithSession(<ActivityDetail activityId="riunione" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findByRole('heading', { name: 'Riunione' });
  expect(screen.queryByRole('button', { name: 'Avvisi su Telegram' })).toBeNull();
});
