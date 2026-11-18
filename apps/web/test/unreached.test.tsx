import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { Shell } from '../src/shell/Shell.js';
import { UnreachedBand } from '../src/shell/UnreachedBand.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

/**
 * A Google project that did not open again is named in a band, its groups missing; the x puts it away (user's bug,
 * 2026-11-18). Before, the project's groups went without a word. With every project open, no band.
 */
test('testABandNamesTheGoogleProjectThatDidNotOpen', async () => {
  const { unmount } = renderWithSession(<Shell />, { ...memorySession(PIPPO), unreached: [{ projectId: 'casa-rossi', reason: 'failed' as const }] });
  const band = await screen.findByRole('alert', { name: 'Progetti Google non raggiunti' });
  expect(band.textContent).toContain('Il progetto Google casa-rossi non si è riaperto: i suoi gruppi per ora non si vedono.');
  expect(screen.getByRole('button', { name: 'Riprova' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('alert', { name: 'Progetti Google non raggiunti' })).toBeNull();
  unmount();
  renderWithSession(<Shell />, memorySession(PIPPO));
  await screen.findByRole('button', { name: 'Impostazioni' });
  expect(screen.queryByRole('alert', { name: 'Progetti Google non raggiunti' })).toBeNull();
});

/**
 * Without a valid Google login the band offers «Accedi di nuovo» (user's choice, 2026-11-18): Google's sign-in as the
 * first connection, then the project's engine is added and its row goes, without a reload. Before, only Riprova,
 * which reloaded the page and showed the same band again.
 */
test('testSignInAgainBringsTheProjectBack', async () => {
  localStorage.setItem('attivita:google-projects', JSON.stringify([{ apiKey: 'k', authDomain: 'casa-rossi.firebaseapp.com', projectId: 'casa-rossi', appId: 'a' }]));
  const engine = memorySession(PIPPO).primary;
  let asked: string | null = null;
  renderWithSession(<UnreachedBand reconnect={async (c, email) => { asked = `${c.projectId} ${email}`; return engine; }} />,
    { ...memorySession(PIPPO), unreached: [{ projectId: 'casa-rossi', reason: 'signedOut' as const }] });
  expect(screen.queryByRole('button', { name: 'Riprova' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Accedi di nuovo' }));
  await waitFor(() => expect(screen.queryByRole('alert', { name: 'Progetti Google non raggiunti' })).toBeNull());
  expect(asked).toBe(`casa-rossi ${PIPPO}`);
  localStorage.clear();
});
