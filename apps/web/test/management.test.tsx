import { screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { InMemoryBackend } from '@attivita/core';
import type { Group } from '@attivita/core';
import { GroupPage } from '../src/groups/GroupPage.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { registerGoogleEngine } from '../src/session/google-config.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

const famiglia: Group = { id: 'g:famiglia', kind: 'invite', name: 'famiglia', ownerId: PIPPO, timeZone: 'Europe/Rome', members: { [PIPPO]: 'owner' }, version: 1 };

/** Two engines: the app's server and a Google project of the person's own. */
function withGoogleGroup() {
  const s = memorySession(PIPPO);
  const b = new InMemoryBackend();
  b.groups.set(famiglia.id, structuredClone(famiglia));
  const google = b.session(PIPPO);
  registerGoogleEngine(google, { apiKey: 'k', authDomain: 'memo-famiglia.firebaseapp.com', projectId: 'memo-famiglia', appId: 'a' });
  return { ...s, engines: [s.primary, google] };
}

/** Each group says where its data are: on the app's server, or in the person's Google project (named on hover). */
test('testCardsSayWhoManagesTheGroup', async () => {
  renderWithSession(<GroupsView />, withGoogleGroup());
  const google = await screen.findByRole('article', { name: 'famiglia' });
  const own = within(google).getByText('gestione privata');
  expect(own.getAttribute('title')).toBe('progetto memo-famiglia');
  expect(within(screen.getByRole('article', { name: 'developers' })).getByText('gestito da terzi')).toBeTruthy();
  expect(within(screen.getByRole('article', { name: 'altereos.com' })).getByText('gestito da terzi')).toBeTruthy();
});

test('testGroupPageSaysWhoManagesIt', async () => {
  renderWithSession(<GroupPage groupId="g:famiglia" onOpen={() => undefined} />, withGoogleGroup());
  await screen.findByRole('heading', { name: 'famiglia' });
  expect(screen.getByText('gestione privata')).toBeTruthy();
});
