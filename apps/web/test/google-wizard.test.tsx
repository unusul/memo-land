import { screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { InMemoryBackend } from '@attivita/core';
import { GoogleGroupWizard } from '../src/groups/GoogleGroupWizard.js';
import {
  configFromInvite, forgetGoogleProjects, inviteLink, parseFirebaseConfig, registerGoogleEngine, rememberProject, rememberedProjects,
} from '../src/session/google-config.js';
import { PIPPO, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

const SNIPPET = `// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
const firebaseConfig = {
  apiKey: "AIzaSyDemo",
  authDomain: "famiglia-123.firebaseapp.com",
  projectId: "famiglia-123",
  storageBucket: "famiglia-123.firebasestorage.app",
  messagingSenderId: "1234",
  appId: "1:1234:web:abcd"
};
const app = initializeApp(firebaseConfig);`;

test('testParsesConsoleSnippetAndJson', () => {
  const fromSnippet = parseFirebaseConfig(SNIPPET);
  expect(fromSnippet).toMatchObject({ apiKey: 'AIzaSyDemo', authDomain: 'famiglia-123.firebaseapp.com', projectId: 'famiglia-123', appId: '1:1234:web:abcd' });
  expect(parseFirebaseConfig(JSON.stringify(fromSnippet))).toEqual(fromSnippet);
  expect(parseFirebaseConfig(SNIPPET.replace(/appId: .*\n/, ''))).toBeNull();
  expect(parseFirebaseConfig('ciao')).toBeNull();
});

test('testWizardCreatesGroupOnConnectedEngine', async () => {
  const s = memorySession();
  const google = new InMemoryBackend();
  const engine = google.session(PIPPO);
  renderWithSession(<GoogleGroupWizard connect={async () => engine} onDone={() => undefined} />, s);
  userClick('Avanti'); userClick('Avanti');
  expect(screen.getByText(/rules_version/)).toBeTruthy();
  userClick('Avanti');
  userType(screen.getByLabelText('Configurazione'), SNIPPET);
  userClick('Collega');
  userType(await screen.findByLabelText('Nome del gruppo'), 'famiglia');
  userClick('Crea gruppo');
  await waitFor(async () => expect((await engine.listGroups()).map(g => g.name)).toEqual(['famiglia']));
  expect((await engine.listGroups())[0]!.members).toEqual({ [PIPPO]: 'owner' });
  expect((await s.primary.listGroups()).map(g => g.name)).not.toContain('famiglia');
  expect(await screen.findByLabelText("Link d'invito")).toBeTruthy();
});

test('testInviteLinkCarriesOnlyPublicConfig', () => {
  const config = parseFirebaseConfig(SNIPPET)!;
  const link = inviteLink(config, 'https://example.test/memo-land/');
  const url = new URL(link);
  expect(url.origin + url.pathname).toBe('https://example.test/memo-land/');
  const carried = JSON.parse(atob(url.searchParams.get('firebase')!));
  expect(Object.keys(carried).sort()).toEqual(['apiKey', 'appId', 'authDomain', 'projectId']);
  expect(configFromInvite(url.search)).toEqual(carried);
  expect(configFromInvite('?firebase=garbage')).toBeNull();
});

/**
 * The same project connected twice (a second group, or an invite link for a project reopened at startup) gave
 * two engines for one project: the router and the activity holder then disagreed and every edit failed.
 */
test('testSecondConnectionReusesTheProjectEngine', async () => {
  const config = parseFirebaseConfig(SNIPPET)!;
  const first = new InMemoryBackend().session(PIPPO);
  registerGoogleEngine(first, config);
  const base = memorySession();
  let connected = 0;
  const connect = async () => { connected++; return new InMemoryBackend().session(PIPPO); };
  renderWithSession(<GoogleGroupWizard connect={connect} onDone={() => undefined} />, { ...base, engines: [...base.engines, first] });
  userClick('Avanti'); userClick('Avanti'); userClick('Avanti');
  userType(screen.getByLabelText('Configurazione'), SNIPPET);
  userClick('Collega');
  userType(await screen.findByLabelText('Nome del gruppo'), 'secondo');
  userClick('Crea gruppo');
  await waitFor(async () => expect((await first.listGroups()).map(g => g.name)).toEqual(['secondo']));
  expect(connected).toBe(0);
});

/** Leaving the central account must not leave the next person on this browser inside the Google projects. */
test('testSignOutForgetsGoogleProjects', async () => {
  rememberProject(parseFirebaseConfig(SNIPPET)!);
  expect(rememberedProjects()).toHaveLength(1);
  await forgetGoogleProjects();
  expect(rememberedProjects()).toEqual([]);
});
