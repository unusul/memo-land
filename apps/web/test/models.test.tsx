import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { addItem, itemKey, newActivity, newModel, setListModel } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { Shell } from '../src/shell/Shell.js';
import { ToastHost } from '../src/shell/toast.js';
import { PIPPO, PLUTO, benchBackend, chooseIn, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

const T = '2026-11-02T08:00:00Z';
const LIST = 'inv:spesa#list';
const MODEL = 'inv:casa#model:m1';
const casa: Group = { id: 'inv:casa', kind: 'invite', name: 'casa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner', [PLUTO]: 'member' }, version: 1 };
const spesa: Group = { id: 'inv:spesa', kind: 'invite', type: 'list', name: 'spesa', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner', [PLUTO]: 'member' }, version: 1 };
beforeEach(() => localStorage.clear());

/** Groups casa and spesa; a ready «Supermercato» of casa when `withModel`; the list of spesa with these items, using it when `uses`. */
function bench({ items = [] as string[], withModel = true, uses = false } = {}) {
  const backend = benchBackend();
  for (const g of [casa, spesa]) backend.groups.set(g.id, structuredClone(g));
  if (withModel) backend.activities.set(MODEL, newModel({ id: MODEL, groupId: casa.id, accountId: PIPPO, name: 'Supermercato', ready: true }, T));
  let l: Activity = newActivity({ id: LIST, accountId: PIPPO, title: 'spesa', groupId: spesa.id }, T);
  for (const t of items) l = addItem(l, t, PIPPO, T);
  if (uses) l = setListModel(l, MODEL, PIPPO, T);
  backend.activities.set(l.id, l);
  return memorySession(PIPPO, {}, backend);
}

const stored = async (s: ReturnType<typeof bench>, id: string) => (await s.primary.getActivity(id)).activity;
const page = () => screen.getByRole('article', { name: 'Supermercato' });

async function openList(s: ReturnType<typeof bench>) {
  renderWithSession(<Shell />, s);
  fireEvent.click(await within(await screen.findByRole('navigation', { name: 'Sezioni' })).findByRole('button', { name: /^spesa/ }));
  await screen.findByPlaceholderText('Aggiungi una voce…');
}

async function openModelPage(s: ReturnType<typeof bench>) {
  renderWithSession(<ToastHost><GroupsView /></ToastHost>, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Gestisci il modello Supermercato' }));
  return page();
}

const openSection = (name: string) => fireEvent.click(within(page()).getByRole('button', { name: `Voci di ${name}` }));

/** The sections start closed each time the page opens (user's choice, 2026-11-16): reordering them takes a short page. */
test('testSectionsStartClosed', async () => {
  const p = await openModelPage(bench());
  const frigo = within(p).getByRole('button', { name: 'Voci di Banco frigo' });
  expect(frigo.getAttribute('aria-expanded')).toBe('false');
  expect(within(p).queryByRole('button', { name: 'Sezione di latte' })).toBeNull();
  expect(within(within(p).getByRole('group', { name: 'Banco frigo' })).getByText(/^\d+$/)).toBeTruthy();
  openSection('Banco frigo');
  expect(frigo.getAttribute('aria-expanded')).toBe('true');
  expect(within(p).getByRole('button', { name: 'Sezione di latte' })).toBeTruthy();
  openSection('Banco frigo');
  expect(within(p).queryByRole('button', { name: 'Sezione di latte' })).toBeNull();
});

/** Noi lists the models under «Modelli», with their group; a model is not an activity of its group anywhere else. */
test('testNoiListsModelsAndGroupsDoNotCountThem', async () => {
  renderWithSession(<GroupsView />, bench());
  const models = await screen.findByRole('list', { name: 'Modelli' });
  expect(within(models).getByRole('button', { name: 'Apri il modello Supermercato' }).textContent).toContain('di casa');
  expect(screen.getByRole('button', { name: /^Apri casa/ }).getAttribute('aria-label')).toBe('Apri casa');
});

/** «Nuovo modello»: a name, the group, «Supermercato (pronto)»; made in that group with the ready sections, page opened. */
test('testCreateAReadyModel', async () => {
  const s = bench({ withModel: false });
  renderWithSession(<GroupsView />, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo modello' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Supermercato (pronto)' }));
  expect((screen.getByLabelText('Nome del modello') as HTMLInputElement).value).toBe('Supermercato');
  chooseIn('Gruppo del modello', casa.id);
  userClick('Crea');
  const made = await screen.findByRole('article', { name: 'Supermercato' });
  expect(within(made).getByRole('group', { name: 'Banco frigo' })).toBeTruthy();
  const all = await s.primary.listActivities(casa.id);
  expect(all.filter(a => a.model).map(a => [a.title, a.model!.sections.length])).toEqual([['Supermercato', 13]]);
});

/** «Vuoto» starts with Altro only: any kind of list. */
test('testCreateAnEmptyModel', async () => {
  const s = bench({ withModel: false });
  renderWithSession(<GroupsView />, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Nuovo modello' }));
  userType(screen.getByLabelText('Nome del modello'), 'Videogiochi');
  userClick('Crea');
  const made = await screen.findByRole('article', { name: 'Videogiochi' });
  expect(within(made).getAllByRole('group').map(g => g.getAttribute('aria-label'))).toEqual(['Altro']);
});

/** «Senza sezione»: what the lists using the model hold and the model does not know, placed from its chip. */
test('testPlaceAnUnplacedItemOfAList', async () => {
  const s = bench({ items: ['latte', 'kombucha'], uses: true });
  const p = await openModelPage(s);
  expect(within(within(p).getByRole('group', { name: 'Senza sezione' })).getByText('kombucha')).toBeTruthy();
  chooseIn('Sezione di kombucha', 'bevande');
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('kombucha')]).toEqual({ name: 'kombucha', section: 'bevande' }));
  await waitFor(() => expect(within(page()).queryByRole('group', { name: 'Senza sezione' })).toBeNull());
});

/** A new item goes to the section chosen beside it; a chip moves it or takes it away. */
test('testAddMoveAndRemoveItems', async () => {
  const s = bench();
  await openModelPage(s);
  chooseIn('Sezione della nuova voce', 'bevande');
  const field = screen.getByRole('textbox', { name: 'Nuova voce del modello' });
  userType(field, 'kombucha');
  fireEvent.submit(field.closest('form')!);
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('kombucha')]?.section).toBe('bevande'));
  openSection('Banco frigo');
  chooseIn('Sezione di latte', 'colazione');
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('latte')]?.section).toBe('colazione'));
  openSection('Bevande');
  chooseIn('Sezione di kombucha', '');
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('kombucha')]).toBeUndefined());
});

test('testRenameAddRemoveAndReorderSections', async () => {
  const s = bench();
  const p = await openModelPage(s);
  fireEvent.click(within(p).getByRole('button', { name: 'Rinomina Banco frigo' }));
  const name = within(p).getByRole('textbox', { name: 'Nome di Banco frigo' });
  userType(name, 'Frigo');
  fireEvent.submit(name.closest('form')!);
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections[1]!.name).toBe('Frigo'));
  const add = screen.getByRole('textbox', { name: 'Nuova sezione' });
  userType(add, 'Erboristeria');
  fireEvent.submit(add.closest('form')!);
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.name).slice(-2)).toEqual(['Erboristeria', 'Altro']));
  expect(within(page()).queryByRole('button', { name: 'Togli Altro' })).toBeNull();
  fireEvent.click(within(page()).getByRole('button', { name: 'Togli Bevande' }));
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.name)).not.toContain('Bevande'));
  fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.name)).toContain('Bevande'));
  fireEvent.keyDown(within(page()).getByRole('button', { name: 'Sposta Frutta e verdura' }), { key: 'ArrowDown' });
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.id).slice(0, 2)).toEqual(['frigo', 'frutta']));
});

test('testRenameTheModelAndChangeItsIcon', async () => {
  const s = bench();
  const p = await openModelPage(s);
  fireEvent.click(within(p).getByRole('button', { name: 'Icona di Supermercato' }));
  fireEvent.click(within(p).getByRole('button', { name: 'Cucina' }));
  await waitFor(async () => expect((await stored(s, MODEL)).model!.icon).toBe('kitchen'));
  fireEvent.click(within(p).getByRole('button', { name: 'Rinomina il modello' }));
  const field = within(p).getByRole('textbox', { name: 'Nome del modello' });
  userType(field, 'Esselunga');
  fireEvent.submit(field.closest('form')!);
  await waitFor(async () => expect((await stored(s, MODEL)).title).toBe('Esselunga'));
});

/** «Elimina il modello» asks first; the model goes, the lists using it stay as they are. */
test('testDeleteTheModel', async () => {
  const s = bench({ items: ['latte'], uses: true });
  await openModelPage(s);
  userClick('Elimina il modello');
  userClick('Conferma eliminazione');
  await waitFor(async () => expect((await stored(s, MODEL)).status).toBe('archived'));
  expect(await screen.findByRole('button', { name: 'Nuovo modello' })).toBeTruthy();
  expect(screen.queryByRole('list', { name: 'Modelli' })).toBeNull();
  expect((await stored(s, LIST)).checklist!.items.map(i => i.text)).toEqual(['latte']);
});

/** «Modello della lista»: the models with their group, or none; chosen, «Ordina per sezione» shows. */
test('testListChoosesAModelAndSortsBySection', async () => {
  const s = bench({ items: ['detersivo', 'latte', 'kombucha', 'zucchine'] });
  await openList(s);
  expect(screen.queryByRole('button', { name: 'Ordina per sezione' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modello della lista' }));
  const menu = screen.getByRole('menu', { name: 'Modello della lista' });
  expect(within(menu).getAllByRole('menuitemradio').map(b => b.textContent)).toEqual(['Nessun modello', 'Supermercato · casa']);
  fireEvent.click(within(menu).getByRole('menuitemradio', { name: 'Supermercato · casa' }));
  await waitFor(async () => expect((await stored(s, LIST)).checklist!.model).toBe(MODEL));
  fireEvent.click(await screen.findByRole('button', { name: 'Ordina per sezione' }));
  await waitFor(async () => expect((await stored(s, LIST)).checklist!.items.map(i => i.text)).toEqual(['zucchine', 'latte', 'detersivo', 'kombucha']));
  chooseIn('Modello della lista', '');
  await waitFor(async () => expect((await stored(s, LIST)).checklist!.model).toBeUndefined());
});

/** The list shows only its items (user's choice, 2026-11-16): no section on them, and no panel of sections. */
test('testListShowsNoSections', async () => {
  await openList(bench({ items: ['latte', 'kombucha'], uses: true }));
  const list = screen.getByRole('region', { name: 'Lista' });
  expect(within(list).queryByText(/Banco frigo|Altro/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Reparti' })).toBeNull();
});

/** Not in an activity's own list: models are for a list group's list. */
test('testNoModelChoiceInAnActivityList', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByDisplayValue('app gestione core');
  userClick('+ Lista');
  expect(screen.queryByRole('button', { name: 'Modello della lista' })).toBeNull();
});
