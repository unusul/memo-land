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
  expect(screen.getByRole('button', { name: /^Agenda/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Nuova bozza' })).toBeTruthy();
});
