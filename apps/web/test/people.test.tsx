import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { namesOf } from '../src/groups/barPrefs.js';
import { historyText, shortName, youName } from '../src/labels.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, PLUTO, memorySession, renderWithSession, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());

async function openPeople() {
  renderWithSession(<Shell />, memorySession(PIPPO));
  fireEvent.click(await screen.findByRole('button', { name: 'Impostazioni' }));
  return screen.findByRole('group', { name: 'Persone' });
}

/**
 * Impostazioni → Persone (user's choice, 2026-11-18): the person, then everyone in their groups; a name given there is seen
 * only by them and everywhere, one per person. Before, a member could only read as their email before the @.
 */
test('testANameGivenInSettingsIsUsedEverywhere', async () => {
  const people = await openPeople();
  // The person first, as «tu» (user's bug, 2026-11-18: they missed themselves); before, only the others.
  expect(within(people).getAllByRole('listitem')[0]!.textContent).toContain(`tu · ${PIPPO}`);
  expect(within(people).getByText(new RegExp(`^${PLUTO} · `))).toBeTruthy();
  fireEvent.click(within(people).getByRole('button', { name: `Dai un nome a ${PLUTO}` }));
  const field = within(people).getByRole('textbox', { name: `Nome di ${PLUTO}` });
  expect(document.activeElement).toBe(field);
  userType(field, '  Topolino ');
  fireEvent.submit(field.closest('form')!);
  expect(namesOf(PIPPO)).toEqual({ [PLUTO]: 'Topolino' });
  await waitFor(() => expect(within(people).getByText('Topolino')).toBeTruthy());
  expect(shortName(PLUTO)).toBe('Topolino');
  expect(historyText({ kind: 'created', by: PLUTO, at: '2026-11-18T08:00:00Z' } as Parameters<typeof historyText>[0])).toBe("Topolino l'ha creata");
});

/**
 * A name the person gives themselves takes the place of «tu» where a row says who has it (user's bug, 2026-11-18:
 * «Casa · tu» did not change); without one, «tu» as before.
 */
test('testTheirOwnNameTakesThePlaceOfTu', async () => {
  const people = await openPeople();
  expect(youName(PIPPO)).toBe('tu');
  fireEvent.click(within(people).getByRole('button', { name: `Dai un nome a ${PIPPO}` }));
  const field = within(people).getByRole('textbox', { name: `Nome di ${PIPPO}` });
  userType(field, 'Rob');
  fireEvent.submit(field.closest('form')!);
  expect(youName(PIPPO)).toBe('Rob');
});

/** Esc gives up what is typed; an empty name gives the email's back. */
test('testEscGivesUpAndAnEmptyNameGivesTheEmailsBack', async () => {
  const people = await openPeople();
  fireEvent.click(within(people).getByRole('button', { name: `Dai un nome a ${PLUTO}` }));
  let field = within(people).getByRole('textbox', { name: `Nome di ${PLUTO}` });
  userType(field, 'Topolino');
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(namesOf(PIPPO)).toEqual({});
  fireEvent.click(within(people).getByRole('button', { name: `Dai un nome a ${PLUTO}` }));
  field = within(people).getByRole('textbox', { name: `Nome di ${PLUTO}` });
  userType(field, 'Topolino');
  fireEvent.blur(field);
  expect(namesOf(PIPPO)).toEqual({ [PLUTO]: 'Topolino' });
  fireEvent.click(within(people).getByRole('button', { name: `Dai un nome a ${PLUTO}` }));
  field = within(people).getByRole('textbox', { name: `Nome di ${PLUTO}` });
  expect((field as HTMLInputElement).value).toBe('Topolino');
  userType(field, '');
  fireEvent.submit(field.closest('form')!);
  expect(namesOf(PIPPO)).toEqual({});
  expect(shortName(PLUTO)).toBe('pluto');
});
