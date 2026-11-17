import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { PIPPO, PLUTO, benchBackend, expandAgendaRows, memorySession, pickDate, pickDateTime, renderWithSession, userClick } from './memory-session.js';

beforeEach(() => localStorage.clear());

/** «Aggiornare la documentazione», pluto's, in the domain group: no assignee, no priority. */
async function openDoc() {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="doc" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Aggiornare la documentazione' });
  return s;
}
const menu = (name: string) => screen.getByRole('menu', { name });

/**
 * A chip whose value is one choice among a few opens a menu right under itself, and the choice applies at once: no
 * form under the chips, no Aggiungi (user's choice, 2026-11-16). Assegna lists the person first, as «a me».
 */
test('testAssignChipIsAMenuThatAppliesAtOnce', async () => {
  const s = await openDoc();
  userClick('+ Assegna');
  expect(within(menu('Assegna')).getAllByRole('menuitemradio').map(b => b.textContent)).toEqual(['a me', 'pluto']);
  expect(screen.queryByRole('button', { name: 'Aggiungi' })).toBeNull();
  fireEvent.click(within(menu('Assegna')).getByRole('menuitemradio', { name: 'pluto' }));
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.props.assignment?.assignee).toBe(PLUTO));
  expect(screen.queryByRole('menu')).toBeNull();
});

/** Scadenza: Oggi, Domani, Tra una settimana or a day of the month, in the menu; the day chosen is the due date. */
test('testDueChipIsAMenuWithTheDatePicker', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('+ Scadenza');
  expect(within(menu('Scadenza')).getByRole('button', { name: 'Domani' })).toBeTruthy();
  pickDate('Scadenza', '2026-12-03');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.props.due).toBe('2026-12-03'));
  expect(screen.queryByRole('menu')).toBeNull();
});

/** A press outside the menu closes it with nothing chosen. */
test('testAPressOutsideClosesTheChipMenu', async () => {
  const s = await openDoc();
  userClick('+ Priorità');
  expect(menu('Priorità')).toBeTruthy();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole('menu')).toBeNull();
  expect((await s.primary.getActivity('doc')).activity.props.priority).toBeUndefined();
});

/** A property already set opens the same menu from its row, the value now marked; Priorità there offers «Normale». */
test('testASetPriorityRowOpensTheMenuWithNormal', async () => {
  const s = await openDoc();
  userClick('+ Priorità');
  fireEvent.click(within(menu('Priorità')).getByRole('menuitemradio', { name: 'Alta' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Modifica Priorità' }));
  const choices = within(menu('Priorità')).getAllByRole('menuitemradio');
  expect(choices.map(b => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Alta', 'true'], ['Normale', 'false'], ['Bassa', 'false']]);
  fireEvent.click(choices[1]!);
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.props.priority).toBeUndefined());
});

/**
 * Data e ora, Ripeti and In attesa di keep their fields, in a panel over the page under the chip, the page dimmed; it
 * closes with Applica or Annulla, two icons at its bottom right, and Esc drops it; a press outside does nothing (user's
 * choices, 2026-11-17). Before, a press outside saved and closed it, and a Salva button followed the fields.
 */
test('testAPanelClosesOnlyWithItsIcons', async () => {
  const s = await openDoc();
  userClick('+ Data e ora');
  const panel = screen.getByRole('dialog', { name: 'Data e ora' });
  expect(within(panel).getAllByRole('button').slice(-2).map(b => b.getAttribute('aria-label'))).toEqual(['Annulla', 'Applica']);
  expect(document.querySelector('.panel-backdrop')).not.toBeNull();
  pickDateTime('Data e ora', '2026-12-04T18:10');
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole('dialog', { name: 'Data e ora' })).toBeTruthy();
  userClick('Applica');
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.props.schedule?.start).toBe('2026-12-04T18:10'));
  expect(screen.queryByRole('dialog', { name: 'Data e ora' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Data e ora' }));
  pickDateTime('Data e ora', '2026-12-05T08:10');
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Data e ora' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Data e ora' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Data e ora' }));
  pickDateTime('Data e ora', '2026-12-06T08:10');
  userClick('Annulla');
  expect(screen.queryByRole('dialog', { name: 'Data e ora' })).toBeNull();
  expect(document.querySelector('.panel-backdrop')).toBeNull();
  expect((await s.primary.getActivity('doc')).activity.props.schedule?.start).toBe('2026-12-04T18:10');
});

/** Rifiuta… asks the reason in a panel under it; a press outside does nothing, Annulla closes it keeping what was typed. */
test('testRejectReasonInAPanelKeptOnAnnulla', async () => {
  const s = memorySession(PLUTO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Rifiuta…' }));
  fireEvent.change(within(menu('Rifiuta')).getByLabelText('Motivo'), { target: { value: 'non ho tempo' } });
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole('menu', { name: 'Rifiuta' })).toBeTruthy();
  userClick('Annulla');
  expect(screen.queryByRole('menu', { name: 'Rifiuta' })).toBeNull();
  expect((await s.primary.getActivity('costi')).activity.props.assignment?.state).toBe('proposed');
  userClick('Rifiuta…');
  expect((within(menu('Rifiuta')).getByLabelText('Motivo') as HTMLInputElement).value).toBe('non ho tempo');
  userClick('Rifiuta');
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.props.assignment).toBeUndefined());
});

/**
 * An archived group is read only, out of the bar and the agenda: no activity can be moved into it. The menu of the
 * groups listed it until 2026-11-16, from a draft's «+ Gruppo» and from the Dove row alike.
 */
test('testAnArchivedGroupIsNoPlaceToMoveTo', async () => {
  const backend = benchBackend();
  backend.groups.set('inv:developers', { ...backend.groups.get('inv:developers')!, archived: true });
  const view = renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('+ Gruppo');
  expect(within(menu('Gruppo')).getAllByRole('menuitemradio').map(b => b.textContent)).toEqual(['Personale', 'altereos.com']);
  view.unmount();
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  fireEvent.click(await screen.findByRole('button', { name: 'Modifica Dove' }));
  expect(within(menu('Dove')).getAllByRole('menuitemradio').map(b => b.textContent)).toEqual(['Personale']);
});

/**
 * Scomponi… offers the same groups as the move menu: before 2026-11-16 it listed every group, archived ones, list
 * groups and groups where the person is a guest included, where the new activities would be refused or unseen.
 */
test('testDecomposeOffersOnlyGroupsThatTakeActivities', async () => {
  const backend = benchBackend();
  backend.groups.set('inv:developers', { ...backend.groups.get('inv:developers')!, archived: true });
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession(PIPPO, {}, backend));
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('Scomponi…');
  const select = screen.getByLabelText('Gruppo') as HTMLSelectElement;
  expect([...select.options].map(o => o.textContent)).toEqual(['Personale', 'altereos.com']);
  expect(select.value).toBe('domain:altereos.com');
});

/**
 * Assegna also takes a name outside the group, typed in «Altro nome…»: assigned at once, with no proposal (user's
 * choice, 2026-11-16). The row says the name; the name comes back as a choice; a member's name typed is that member.
 */
test('testAssignToANameOutsideTheGroup', async () => {
  const s = await openDoc();
  userClick('+ Assegna');
  userClick('Altro nome…');
  fireEvent.change(screen.getByLabelText('Altro nome'), { target: { value: 'idraulico' } });
  fireEvent.submit(screen.getByLabelText('Altro nome').closest('form')!);
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.props.assignment)
    .toEqual({ state: 'accepted', assignee: 'idraulico', assignedBy: 'pippo@altereos.com', external: true }));
  expect((await screen.findByRole('button', { name: 'Modifica Assegna' })).textContent).toBe('idraulico');
  expect(screen.queryByRole('button', { name: 'Accetta' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Assegna' }));
  expect(within(menu('Assegna')).getAllByRole('menuitemradio').map(b => [b.textContent, b.getAttribute('aria-checked')]))
    .toEqual([['a me', 'false'], ['pluto', 'false'], ['idraulico', 'true']]);
  userClick('Altro nome…');
  fireEvent.change(screen.getByLabelText('Altro nome'), { target: { value: 'Pluto' } });
  fireEvent.submit(screen.getByLabelText('Altro nome').closest('form')!);
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.props.assignment)
    .toEqual({ state: 'proposed', assignee: PLUTO, assignedBy: 'pippo@altereos.com' }));
});

/** In the agenda a name outside the group shows as who has it, and the bar's bottom says taken by someone else. */
test('testAgendaShowsTheNameOutside', async () => {
  const s = memorySession();
  const { activity } = await s.primary.getActivity('backup');
  await s.primary.saveActivity({ ...activity, props: { ...activity.props, assignment: { state: 'accepted', assignee: 'idraulico', assignedBy: PIPPO, external: true } } }, activity.version);
  renderWithSession(<AgendaView from="2026-11-02" days={3} onOpen={() => undefined} />, s);
  await screen.findAllByText('Controllo backup');
  expandAgendaRows();
  const row = screen.getAllByText('Controllo backup')[0]!.closest('.item') as HTMLElement;
  expect(within(row).getByText('altereos.com · idraulico')).toBeTruthy();
  expect(row.dataset.take).toBe('other');
});
