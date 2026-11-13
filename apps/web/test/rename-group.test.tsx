import { screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { GroupPage } from '../src/groups/GroupPage.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { OSPITE, PIPPO, PLUTO, manage, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

/** The owner renames an invite group from its page; every member sees the new name. */
test('testOwnerRenamesTheGroupFromItsPage', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<GroupPage groupId="inv:developers" onOpen={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'developers' });
  userClick('Rinomina developers');
  userType(screen.getByLabelText('Nome del gruppo'), '  sviluppo ');
  userClick('Salva il nome');
  await waitFor(async () => expect((await s.primary.getGroup('inv:developers')).name).toBe('sviluppo'));
  expect(await screen.findByRole('heading', { name: 'sviluppo' })).toBeTruthy();
});

test('testRenameCanBeCancelledAndRefusesAnEmptyName', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<GroupsView />, s);
  const card = await manage('developers');
  userClick('Rinomina developers');
  userType(within(card).getByLabelText('Nome del gruppo'), '   ');
  expect((within(card).getByRole('button', { name: 'Salva il nome' }) as HTMLButtonElement).disabled).toBe(true);
  userClick('Annulla');
  expect(within(card).queryByLabelText('Nome del gruppo')).toBeNull();
  expect((await s.primary.getGroup('inv:developers')).name).toBe('developers');
});

/**
 * Only the owner renames: both engines refuse a new name from anyone else (save_group, Firestore rules). The first
 * version showed the pencil to members too, and the server refused their change. A domain group is named after its domain.
 */
test('testMemberGuestAndDomainGroupHaveNoRename', async () => {
  for (const who of [PLUTO, OSPITE]) {
    const view = renderWithSession(<GroupsView />, memorySession(who));
    await manage('developers');
    expect(screen.queryByRole('button', { name: 'Rinomina developers' })).toBeNull();
    view.unmount();
  }
  renderWithSession(<GroupPage groupId="domain:altereos.com" onOpen={() => undefined} />, memorySession(PIPPO));
  await screen.findByRole('heading', { name: 'altereos.com' });
  expect(screen.queryByRole('button', { name: /Rinomina/ })).toBeNull();
});
