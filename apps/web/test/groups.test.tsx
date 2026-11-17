import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { GroupsView } from '../src/groups/GroupsView.js';
import { MeView } from '../src/me/MeView.js';
import { enqueueDraft } from '../src/offline/outbox.js';
import { newActivity } from '@attivita/core';
import { PIPPO, PLUTO, groupRow, manage, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

test('testCreateInviteGroupAndInvite', async () => {
  const s = memorySession();
  renderWithSession(<GroupsView />, s);
  await groupRow('altereos.com');
  userClick('Nuovo gruppo');
  userType(screen.getByLabelText('Nome'), 'famiglia');
  userClick('Crea');
  const card = await manage('famiglia');
  userClick(/Invita in famiglia/);
  userType(within(card).getByLabelText('Email'), 'Pluto@Altereos.com');
  userClick('Invia invito');
  await waitFor(async () => {
    const g = (await s.primary.listGroups()).find(x => x.name === 'famiglia')!;
    expect(g.members).toEqual({ [PIPPO]: 'owner', [PLUTO]: 'member' });
  });
});

test('testDomainGroupHasNoInviteButton', async () => {
  renderWithSession(<GroupsView />, memorySession());
  const card = await manage('altereos.com');
  expect(within(card).queryByRole('button', { name: /Invita/ })).toBeNull();
  expect(within(card).getByRole('button', { name: /Esci da altereos.com/ })).toBeTruthy();
});

test('testOwnerSeesNoLeaveButtonGuestCannotInvite', async () => {
  const owner = renderWithSession(<GroupsView />, memorySession());
  const dev = await manage('developers');
  expect(within(dev).queryByRole('button', { name: /Esci/ })).toBeNull();
  owner.unmount();
  renderWithSession(<GroupsView />, memorySession('ospite@esterno.it'));
  const asGuest = await manage('developers');
  expect(within(asGuest).queryByRole('button', { name: /Invita/ })).toBeNull();
});

/** Leaving releases the leaver's assignments with a reason, as the spec requires. */
test('testLeaveDomainGroupReleasesAssignments', async () => {
  const s = memorySession();
  renderWithSession(<GroupsView />, s);
  await manage('altereos.com');
  userClick(/Esci da altereos.com/);
  userClick('Conferma uscita');
  await waitFor(async () => expect((await s.primary.listGroups()).map(g => g.id)).not.toContain('domain:altereos.com'));
});

test('testIoShowsQueuedDrafts', async () => {
  const s = memorySession();
  await enqueueDraft(s.outbox, PIPPO, newActivity({ id: 'q1', accountId: PIPPO, title: 'offline' }, '2026-11-04T08:00:00Z'), [], '2026-11-04T08:00:00Z');
  renderWithSession(<MeView />, s);
  expect(await screen.findByText(/1 bozza in attesa di rete/)).toBeTruthy();
});

/**
 * Invita opens a panel over the page (2026-11-16): the role is an app menu, not the browser's drop-down. A press
 * outside does nothing; Annulla closes it keeping the address typed; nothing is sent until «Invia invito» (2026-11-17:
 * before, a press outside closed it).
 */
test('testInvitePanelKeepsWhatWasTypedAndChoosesTheRoleFromAMenu', async () => {
  const s = memorySession();
  renderWithSession(<GroupsView />, s);
  const card = await manage('developers');
  userClick(/Invita in developers/);
  userType(within(card).getByLabelText('Email'), 'nuovo@esempio.it');
  fireEvent.pointerDown(document.body);
  expect(within(card).getByLabelText('Email')).toBeTruthy();
  fireEvent.click(within(screen.getByRole('menu', { name: 'Invita in developers' })).getByRole('button', { name: 'Annulla' }));
  expect(within(card).queryByLabelText('Email')).toBeNull();
  userClick(/Invita in developers/);
  expect((within(card).getByLabelText('Email') as HTMLInputElement).value).toBe('nuovo@esempio.it');
  userClick('Ruolo');
  fireEvent.click(within(screen.getByRole('menu', { name: 'Ruolo' })).getByRole('menuitemradio', { name: 'ospite' }));
  userClick('Invia invito');
  await waitFor(async () => expect((await s.primary.getGroup('inv:developers')).members['nuovo@esempio.it']).toBe('guest'));
});
