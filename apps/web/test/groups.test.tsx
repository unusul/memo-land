import { screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { GroupsView } from '../src/groups/GroupsView.js';
import { MeView } from '../src/me/MeView.js';
import { enqueueDraft } from '../src/offline/outbox.js';
import { newActivity } from '@attivita/core';
import { PIPPO, PLUTO, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

test('testCreateInviteGroupAndInvite', async () => {
  const s = memorySession();
  renderWithSession(<GroupsView />, s);
  await screen.findByRole('article', { name: 'altereos.com' });
  userClick('Nuovo gruppo');
  userType(screen.getByLabelText('Nome'), 'famiglia');
  userClick('Crea');
  const card = await screen.findByRole('article', { name: 'famiglia' });
  userClick(/Invita in famiglia/);
  userType(within(card).getByLabelText('Email'), 'Pluto@Altereos.com');
  userClick('Invia invito');
  await waitFor(async () => {
    const g = (await s.engine.listGroups()).find(x => x.name === 'famiglia')!;
    expect(g.members).toEqual({ [PIPPO]: 'owner', [PLUTO]: 'member' });
  });
});

test('testDomainGroupHasNoInviteButton', async () => {
  renderWithSession(<GroupsView />, memorySession());
  const card = await screen.findByRole('article', { name: 'altereos.com' });
  expect(within(card).queryByRole('button', { name: /Invita/ })).toBeNull();
  expect(within(card).getByRole('button', { name: /Esci da altereos.com/ })).toBeTruthy();
});

test('testOwnerSeesNoLeaveButtonGuestCannotInvite', async () => {
  renderWithSession(<GroupsView />, memorySession());
  const dev = await screen.findByRole('article', { name: 'developers' });
  expect(within(dev).queryByRole('button', { name: /Esci/ })).toBeNull();
  renderWithSession(<GroupsView />, memorySession('ospite@esterno.it'));
  await waitFor(() => expect(screen.getAllByRole('article', { name: 'developers' })).toHaveLength(2));
  const asGuest = screen.getAllByRole('article', { name: 'developers' }).at(-1)!;
  expect(within(asGuest).queryByRole('button', { name: /Invita/ })).toBeNull();
});

/** Leaving releases the leaver's assignments with a reason, as the spec requires. */
test('testLeaveDomainGroupReleasesAssignments', async () => {
  const s = memorySession();
  renderWithSession(<GroupsView />, s);
  await screen.findByRole('article', { name: 'altereos.com' });
  userClick(/Esci da altereos.com/);
  userClick('Conferma uscita');
  await waitFor(async () => expect((await s.engine.listGroups()).map(g => g.id)).not.toContain('domain:altereos.com'));
});

test('testMeShowsAccountAndQueuedDrafts', async () => {
  const s = memorySession();
  await enqueueDraft(s.outbox, PIPPO, newActivity({ id: 'q1', accountId: PIPPO, title: 'offline' }, '2026-11-04T08:00:00Z'), [], '2026-11-04T08:00:00Z');
  renderWithSession(<MeView />, s);
  expect(await screen.findByText(PIPPO)).toBeTruthy();
  expect(await screen.findByText(/1 bozza in attesa di rete/)).toBeTruthy();
});
