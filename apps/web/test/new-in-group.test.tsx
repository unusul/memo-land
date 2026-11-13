import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, firePaste, memorySession, renderWithSession, userClick, userType, pickDate } from './memory-session.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

async function plusInDevelopers() {
  const s = memorySession(PIPPO);
  renderWithSession(<Shell />, s);
  const nav = await screen.findByRole('navigation', { name: 'Sezioni' });
  fireEvent.click(await within(nav).findByRole('button', { name: /^developers/ }));
  await screen.findByRole('heading', { name: 'developers' });
  userClick('Nuova attività in developers');
  return s;
}

const detail = () => screen.getByRole('article', { name: 'Nuova attività' });
const created = async (s: ReturnType<typeof memorySession>, title: string) => (await s.primary.listActivities('inv:developers')).find(a => a.title === title);

/** Inside a group the + opens the detail itself, empty: title, where, the properties; no actions and no history yet. */
test('testPlusInAGroupOpensAnEmptyDetail', async () => {
  await plusInDevelopers();
  const d = detail();
  expect((within(d).getByLabelText('Titolo') as HTMLInputElement).value).toBe('');
  expect(within(d).getByText(/^developers/)).toBeTruthy();
  expect(within(d).getByRole('button', { name: '+ Scadenza' })).toBeTruthy();
  expect(within(d).queryByText('Storico')).toBeNull();
  expect(within(d).queryByRole('button', { name: 'Fatto' })).toBeNull();
  expect((within(d).getByRole('button', { name: "Salva l'attività" }) as HTMLButtonElement).disabled).toBe(true);
});

test('testNewActivityIsSavedWithItsPropertiesAndFiles', async () => {
  const s = await plusInDevelopers();
  userType(within(detail()).getByLabelText('Titolo'), 'preparare la demo');
  userClick('+ Scadenza');
  pickDate('Scadenza', '2026-11-20');
  userClick('Aggiungi');
  expect(await created(s, 'preparare la demo')).toBeUndefined();
  firePaste(detail(), new File([new Uint8Array([1, 2])], 'schema.png', { type: 'image/png' }));
  await screen.findByText('schema.png');
  userClick("Salva l'attività");
  await waitFor(async () => expect(await created(s, 'preparare la demo')).toBeTruthy());
  const a = (await created(s, 'preparare la demo'))!;
  expect(a.props.due).toBe('2026-11-20');
  await waitFor(async () => expect((await created(s, 'preparare la demo'))!.attachments.map(f => f.name)).toEqual(['schema.png']));
  expect(a.history.map(h => h.kind)).toEqual(['created', 'propSet']);
  const list = await screen.findByRole('region', { name: 'Elenco di developers' });
  expect(await within(list).findByText('preparare la demo')).toBeTruthy();
});

/** Nothing is stored until there is a title: a + pressed by mistake leaves nothing behind. */
test('testClosingWithoutATitleDiscards', async () => {
  const s = await plusInDevelopers();
  userClick('+ Scadenza');
  pickDate('Scadenza', '2026-11-20');
  userClick('Aggiungi');
  userClick('Indietro');
  await screen.findByRole('region', { name: 'Elenco di developers' });
  expect((await s.primary.listActivities('inv:developers')).map(a => a.title).sort()).toEqual(['Analisi costi']);
});

test('testClosingWithATitleSaves', async () => {
  const s = await plusInDevelopers();
  userType(within(detail()).getByLabelText('Titolo'), 'rivedere il backlog');
  userClick('Indietro');
  await waitFor(async () => expect(await created(s, 'rivedere il backlog')).toBeTruthy());
});

/** Offline the group's engine is out of reach: the activity is kept as a draft, and the person is told where it went. */
test('testNewActivityOfflineIsKeptAsADraft', async () => {
  const s = await plusInDevelopers();
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  userType(within(detail()).getByLabelText('Titolo'), 'senza rete');
  userClick("Salva l'attività");
  expect(await screen.findByText('Senza rete: salvata nelle bozze. Spostala in developers quando torna la connessione.')).toBeTruthy();
  expect((await s.outbox.list(PIPPO)).map(e => e.activity.title)).toEqual(['senza rete']);
  expect(await created(s, 'senza rete')).toBeUndefined();
});
