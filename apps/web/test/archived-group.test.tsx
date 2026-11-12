import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { AgendaView } from '../src/agenda/AgendaView.js';
import { GroupsView } from '../src/groups/GroupsView.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
});
afterEach(() => vi.useRealTimers());

/** developers, archived by its owner pippo. */
function withArchivedDevelopers(account = PIPPO) {
  const backend = benchBackend();
  backend.groups.set('inv:developers', { ...backend.groups.get('inv:developers')!, archived: true });
  return memorySession(account, {}, backend);
}

/** The owner archives a group from its card: it leaves the cards and the bar, and waits under Archiviati. */
test('testOwnerArchivesTheGroupFromItsCard', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<Shell />, s);
  const nav = await screen.findByRole('navigation', { name: 'Sezioni' });
  await within(nav).findByRole('button', { name: /^developers/ });
  fireEvent.click(within(nav).getByRole('button', { name: 'Noi' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Archivia developers' }));
  await waitFor(async () => expect((await s.primary.getGroup('inv:developers')).archived).toBe(true));
  expect(await screen.findByRole('group', { name: 'Archiviati (1)' })).toBeTruthy();
  expect(screen.queryByRole('article', { name: 'developers' })).toBeNull();
  expect(within(nav).queryByRole('button', { name: /^developers/ })).toBeNull();
});

test('testOwnerReopensAnArchivedGroup', async () => {
  const s = withArchivedDevelopers();
  renderWithSession(<GroupsView />, s);
  fireEvent.click(await screen.findByRole('button', { name: 'Riapri developers' }));
  await waitFor(async () => expect((await s.primary.getGroup('inv:developers')).archived).toBeUndefined());
  expect(await screen.findByRole('article', { name: 'developers' })).toBeTruthy();
});

/** Members see it archived too, and cannot archive or reopen: that is the owner's. */
test('testMembersNeitherArchiveNorReopen', async () => {
  renderWithSession(<GroupsView />, memorySession(PLUTO));
  await screen.findByRole('article', { name: 'developers' });
  expect(screen.queryByRole('button', { name: 'Archivia developers' })).toBeNull();
  renderWithSession(<GroupsView />, withArchivedDevelopers(PLUTO));
  expect(await screen.findByRole('group', { name: 'Archiviati (1)' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Riapri developers' })).toBeNull();
});

/** An archived group's activities are out of the agenda, and open read only. */
test('testArchivedGroupLeavesTheAgendaAndIsReadOnly', async () => {
  // Pluto sees "Analisi costi" among the overdue and the proposals while developers is open (attention.test).
  const view = renderWithSession(<AgendaView onOpen={() => undefined} />, withArchivedDevelopers(PLUTO));
  await screen.findAllByText('Controllo backup');
  expect(screen.queryByText('Analisi costi')).toBeNull();
  view.unmount();
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, withArchivedDevelopers());
  expect(await screen.findByRole('heading', { name: 'Analisi costi' })).toBeTruthy();
  expect(screen.queryByLabelText('Titolo')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archivia' })).toBeNull();
});
