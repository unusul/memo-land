import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { GLOSSARY } from '../src/help/glossary.js';
import { HelpView } from '../src/help/HelpView.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, memorySession, renderWithSession, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());
// Unmounts first, then leaves time to the test's history entries to be taken back (see back.test.tsx).
afterEach(async () => { cleanup(); await new Promise(r => setTimeout(r, 50)); });

const openHelp = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Impostazioni' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aiuto e glossario' }));
  return screen.findByRole('heading', { name: 'Aiuto e glossario' });
};

/** From the settings: a few lines of help, then the glossary by topic. */
test('testHelpOpensFromTheSettings', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  await openHelp();
  expect(screen.getByText(/per scrivere al volo/)).toBeTruthy();
  const glossary = screen.getByRole('region', { name: 'Glossario' });
  for (const topic of ['Sezioni', 'Gruppi', 'Ruoli', "Forme di un'attività", 'Proprietà', 'Azioni']) {
    expect(within(glossary).getByRole('heading', { name: topic })).toBeTruthy();
  }
  expect(within(glossary).getByText('Ospite')).toBeTruthy();
});

/** Every word appears once in its topic, so a search never shows two answers that disagree. */
test('testGlossaryWordsAreUniqueWithinATopic', () => {
  for (const topic of GLOSSARY) {
    const words = topic.groups.flatMap(g => g.terms.map(t => t.word));
    expect(new Set(words).size).toBe(words.length);
  }
});

/** The search keeps the words, or the definitions, that contain what is typed; it ignores case and accents. */
test('testGlossarySearch', () => {
  renderWithSession(<HelpView />, memorySession(PIPPO));
  const box = screen.getByRole('searchbox', { name: 'Cerca una parola' });
  userType(box, 'OSPITE');
  const glossary = screen.getByRole('region', { name: 'Glossario' });
  expect(within(glossary).getByText('Ospite')).toBeTruthy();
  expect(within(glossary).queryByText('Agenda')).toBeNull();
  expect(within(glossary).queryByRole('heading', { name: 'Sezioni' })).toBeNull();
  userType(box, 'attivita libera');
  expect(within(glossary).getByText('Me la prendo')).toBeTruthy();
  userType(box, 'zzz');
  expect(within(glossary).getByText('Nessuna parola trovata.')).toBeTruthy();
});

/** The phone's back from the help goes to the settings, where it was opened. */
test('testBackFromHelpGoesToTheSettings', async () => {
  renderWithSession(<Shell />, memorySession(PIPPO));
  await openHelp();
  await new Promise(r => setTimeout(r, 10));
  window.history.back();
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Impostazioni' })).toBeTruthy());
});
