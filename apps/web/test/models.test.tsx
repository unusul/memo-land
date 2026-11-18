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

/**
 * What the lists using the model hold and the model does not know is in Altro, lit as new, Altro open; placed from its
 * chip. Before 2026-11-18 it stood apart under «Senza sezione» and Altro said 0 (user's bug: «non si capisce niente»).
 */
test('testUnplacedItemOfAListIsNewInAltro', async () => {
  const s = bench({ items: ['latte', 'kombucha'], uses: true });
  const p = await openModelPage(s);
  expect(within(p).queryByRole('group', { name: 'Senza sezione' })).toBeNull();
  const altro = within(p).getByRole('group', { name: 'Altro' });
  expect(within(altro).getByText(/· 1 nuova$/)).toBeTruthy();
  expect(within(altro).getByRole('button', { name: 'Sezione di kombucha' }).className).toContain('fresh');
  chooseIn('Sezione di kombucha', 'bevande');
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('kombucha')]).toEqual({ name: 'kombucha', section: 'bevande' }));
  await waitFor(() => expect(within(page()).queryByRole('button', { name: 'Sezione di kombucha' })).toBeNull());
});

/** An item written in a list that the model does not know is learnt in its Altro, new; a known one leaves it as it is. */
test('testItemWrittenInAListIsLearntInAltro', async () => {
  const s = bench({ uses: true });
  await openList(s);
  const field = screen.getByRole('textbox', { name: 'Nuova voce' });
  for (const t of ['kombucha 2', 'latte', 'nutella veg']) {
    userType(field, t);
    fireEvent.submit(field.closest('form')!);
  }
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('nutella veg')]).toEqual({ name: 'nutella veg', section: 'colazione', fresh: true }));
  const items = (await stored(s, MODEL)).model!.items;
  expect(items[itemKey('kombucha')]).toEqual({ name: 'kombucha', section: 'altro', fresh: true });
  expect(items[itemKey('latte')]!.fresh).toBeUndefined();
  // Learnt, new in the model itself: its sections open by themselves on the model's page.
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Sezioni' })).getByRole('button', { name: 'Noi' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Gestisci il modello Supermercato' }));
  for (const name of ['Colazione e dolci', 'Altro']) {
    expect(within(page()).getByRole('button', { name: `Voci di ${name}` }).getAttribute('aria-expanded')).toBe('true');
  }
  expect(within(page()).getByRole('button', { name: 'Voci di Banco frigo' }).getAttribute('aria-expanded')).toBe('false');
});

/** A variant held by a list, «nutella veg», is new in the section of «nutella», which opens by itself. */
test('testVariantOfAListIsNewInTheSimilarSection', async () => {
  const p = await openModelPage(bench({ items: ['nutella veg'], uses: true }));
  const colazione = within(p).getByRole('group', { name: 'Colazione e dolci' });
  expect(within(colazione).getByText(/· 1 nuova$/)).toBeTruthy();
  expect(within(colazione).getByRole('button', { name: 'Sezione di nutella veg' }).className).toContain('fresh');
  expect(within(within(p).getByRole('group', { name: 'Altro' })).queryByText(/nuova/)).toBeNull();
});

/**
 * A new item is added from «+ voce» at the end of its open section, and the field stays for the next one; a chip moves
 * it or takes it away. Before 2026-11-18 one field at the bottom, with a menu of the section starting on the first one.
 */
test('testAddMoveAndRemoveItems', async () => {
  const s = bench();
  const p = await openModelPage(s);
  openSection('Bevande');
  fireEvent.click(within(p).getByRole('button', { name: 'Aggiungi una voce a Bevande' }));
  const field = within(p).getByRole('textbox', { name: 'Nuova voce in Bevande' });
  expect(document.activeElement).toBe(field);
  for (const t of ['kombucha', 'tepache']) {
    userType(field, t);
    fireEvent.submit(field.closest('form')!);
  }
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('tepache')]?.section).toBe('bevande'));
  expect((await stored(s, MODEL)).model!.items[itemKey('kombucha')]?.section).toBe('bevande');
  expect(within(p).queryByRole('button', { name: 'Sezione della nuova voce' })).toBeNull();
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(within(p).queryByRole('textbox', { name: 'Nuova voce in Bevande' })).toBeNull();
  openSection('Banco frigo');
  chooseIn('Sezione di latte', 'colazione');
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('latte')]?.section).toBe('colazione'));
  chooseIn('Sezione di kombucha', '');
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('kombucha')]).toBeUndefined());
});

/**
 * As the list's new item (user's bug, 2026-11-17): a new item typed and left without Enter is added to its section, and
 * the field closes. Before, leaving the field lost the text. Esc closes it without adding.
 */
test('testNewModelItemIsAddedWhenLeavingTheField', async () => {
  const s = bench();
  const p = await openModelPage(s);
  openSection('Bevande');
  fireEvent.click(within(p).getByRole('button', { name: 'Aggiungi una voce a Bevande' }));
  let field = within(p).getByRole('textbox', { name: 'Nuova voce in Bevande' });
  userType(field, 'kombucha');
  fireEvent.blur(field);
  await waitFor(async () => expect((await stored(s, MODEL)).model!.items[itemKey('kombucha')]?.section).toBe('bevande'));
  expect(within(p).queryByRole('textbox', { name: 'Nuova voce in Bevande' })).toBeNull();
  fireEvent.click(within(p).getByRole('button', { name: 'Aggiungi una voce a Bevande' }));
  field = within(p).getByRole('textbox', { name: 'Nuova voce in Bevande' });
  userType(field, 'tepache');
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(within(p).queryByRole('textbox', { name: 'Nuova voce in Bevande' })).toBeNull();
  expect((await stored(s, MODEL)).model!.items[itemKey('tepache')]).toBeUndefined();
});

test('testRenameAddRemoveAndReorderSections', async () => {
  const s = bench();
  const p = await openModelPage(s);
  fireEvent.click(within(p).getByRole('button', { name: 'Rinomina Banco frigo' }));
  const name = within(p).getByRole('textbox', { name: 'Nome di Banco frigo' });
  userType(name, 'Frigo');
  fireEvent.submit(name.closest('form')!);
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections[1]!.name).toBe('Frigo'));
  // «+ sezione» (user's choice, 2026-11-18): a dashed row becomes the name; created before Altro, opened with «+ voce».
  fireEvent.click(within(p).getByRole('button', { name: 'Aggiungi una sezione' }));
  const add = within(p).getByRole('textbox', { name: 'Nome della nuova sezione' });
  expect(document.activeElement).toBe(add);
  userType(add, 'Erboristeria');
  fireEvent.submit(add.closest('form')!);
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.name).slice(-2)).toEqual(['Erboristeria', 'Altro']));
  expect(within(page()).queryByRole('textbox', { name: 'Nome della nuova sezione' })).toBeNull();
  await waitFor(() => expect(within(page()).getByRole('button', { name: 'Voci di Erboristeria' }).getAttribute('aria-expanded')).toBe('true'));
  expect(within(page()).getByRole('button', { name: 'Aggiungi una voce a Erboristeria' })).toBeTruthy();
  expect(within(page()).queryByRole('button', { name: 'Togli Altro' })).toBeNull();
  fireEvent.click(within(page()).getByRole('button', { name: 'Togli Bevande' }));
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.name)).not.toContain('Bevande'));
  fireEvent.click(await screen.findByRole('button', { name: 'Annulla' }));
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.name)).toContain('Bevande'));
  fireEvent.keyDown(within(page()).getByRole('button', { name: 'Sposta Frutta e verdura' }), { key: 'ArrowDown' });
  await waitFor(async () => expect((await stored(s, MODEL)).model!.sections.map(x => x.id).slice(0, 2)).toEqual(['frigo', 'frutta']));
});

/** Esc or leaving the name of a new section closes it without creating: a section made by mistake is taken away by hand. */
test('testNewSectionIsNotCreatedOnLeaving', async () => {
  const s = bench();
  const p = await openModelPage(s);
  const before = (await stored(s, MODEL)).model!.sections.length;
  fireEvent.click(within(p).getByRole('button', { name: 'Aggiungi una sezione' }));
  let add = within(p).getByRole('textbox', { name: 'Nome della nuova sezione' });
  userType(add, 'Erboristeria');
  fireEvent.blur(add);
  expect(within(p).queryByRole('textbox', { name: 'Nome della nuova sezione' })).toBeNull();
  fireEvent.click(within(p).getByRole('button', { name: 'Aggiungi una sezione' }));
  add = within(p).getByRole('textbox', { name: 'Nome della nuova sezione' });
  expect(add.getAttribute('value') ?? (add as HTMLInputElement).value).toBe('');
  userType(add, 'Erboristeria');
  fireEvent.keyDown(add, { key: 'Escape' });
  expect(within(p).queryByRole('textbox', { name: 'Nome della nuova sezione' })).toBeNull();
  expect((await stored(s, MODEL)).model!.sections.length).toBe(before);
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

/** With a model, typing proposes its items too: «yogu» gives «yogurt» in a list that never had it. */
test('testSuggestionsFromTheListModel', async () => {
  const s = bench({ items: ['lenticchie'], uses: true });
  await openList(s);
  userType(screen.getByLabelText('Nuova voce'), 'yogu');
  fireEvent.click(within(screen.getByRole('list', { name: 'Suggerimenti' })).getByRole('button', { name: 'yogurt' }));
  await waitFor(async () => expect((await stored(s, LIST)).checklist!.items.map(i => i.text)).toEqual(['lenticchie', 'yogurt']));
});
