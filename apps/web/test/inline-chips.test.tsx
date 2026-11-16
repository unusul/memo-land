import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { PLUTO, memorySession, pickDate, pickDateTime, renderWithSession, userClick } from './memory-session.js';

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
 * Data e ora, Ripeti and In attesa di keep their fields, in a panel over the page under the chip; a press outside it
 * saves what was changed (user's choice, 2026-11-16), Esc closes it with nothing saved.
 */
test('testAPanelSavesOnAPressOutsideAndEscDropsIt', async () => {
  const s = await openDoc();
  userClick('+ Data e ora');
  const panel = screen.getByRole('dialog', { name: 'Data e ora' });
  expect(within(panel).getByRole('button', { name: 'Salva' })).toBeTruthy();
  pickDateTime('Data e ora', '2026-12-04T18:10');
  fireEvent.pointerDown(document.body);
  await waitFor(async () => expect((await s.primary.getActivity('doc')).activity.props.schedule?.start).toBe('2026-12-04T18:10'));
  expect(screen.queryByRole('dialog', { name: 'Data e ora' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Data e ora' }));
  pickDateTime('Data e ora', '2026-12-05T08:10');
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Data e ora' }), { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: 'Data e ora' })).toBeNull();
  expect((await s.primary.getActivity('doc')).activity.props.schedule?.start).toBe('2026-12-04T18:10');
});
