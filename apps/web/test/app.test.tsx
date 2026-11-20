import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { App } from '../src/App.js';
import { memorySession } from './memory-session.js';

const noLogin = { sendMagicLink: async () => null, signInWith: async () => undefined, providers: [], startDemo: () => undefined };

test('testShowsLoginWithoutSession', async () => {
  render(<App open={async () => null} login={noLogin} />);
  expect(await screen.findByRole('button', { name: 'Mandami il link' })).toBeTruthy();
});

test('testShowsAgendaWithSession', async () => {
  render(<App open={async () => memorySession()} login={noLogin} />);
  const nav = await screen.findByRole('navigation', { name: 'Sezioni' });
  expect(nav.textContent).toMatch(/^Noi.*Io/);
  expect(screen.getByRole('button', { name: 'Agenda' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Calendario' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Nuova bozza' })).toBeTruthy();
});

/**
 * On Io the + makes a new activity in Personale at once (user's request, 2026-11-20), as on a group's page; on the
 * Agenda it still captures a draft. Before, on Io it captured a draft too.
 */
test('testThePlusOnIoAddsInPersonale', async () => {
  const { fireEvent } = await import('@testing-library/react');
  render(<App open={async () => memorySession()} login={noLogin} />);
  const nav = await screen.findByRole('navigation', { name: 'Sezioni' });
  expect(screen.getByRole('button', { name: 'Nuova bozza' })).toBeTruthy();
  fireEvent.click([...nav.querySelectorAll('button')].find(b => b.textContent?.startsWith('Io'))!);
  fireEvent.click(await screen.findByRole('button', { name: 'Nuova attività in Personale' }));
  expect(await screen.findByRole('textbox', { name: 'Titolo' })).toBeTruthy();
  expect(screen.queryByRole('dialog', { name: 'Nuova bozza' })).toBeNull();
});
