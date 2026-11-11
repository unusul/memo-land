import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { archive, complete, newActivity } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { GroupPage } from '../src/groups/GroupPage.js';
import { MeView } from '../src/me/MeView.js';
import { OSPITE, PIPPO, benchBackend, memorySession, renderWithSession } from './memory-session.js';

const T = '2026-11-02T08:00:00Z';
beforeEach(() => localStorage.clear());

async function withClosed(account = PIPPO) {
  const backend = benchBackend();
  const s = memorySession(PIPPO, {}, backend);
  const mk = (id: string, title: string, groupId: string | null) => newActivity({ id, accountId: PIPPO, title, groupId }, T);
  await s.primary.saveActivity(archive(mk('old', 'vecchia idea', 'inv:developers'), PIPPO, T), null);
  await s.primary.saveActivity(complete({ ...mk('done', 'demo fatta', 'inv:developers'), props: { due: '2026-11-01' } }, PIPPO, '2026-11-01', T), null);
  await s.primary.saveActivity(archive(mk('d1', 'bozza scartata', null), PIPPO, T), null);
  await s.primary.saveActivity(archive(mk('p1', 'libro letto', `personal:${PIPPO}`), PIPPO, T), null);
  return account === PIPPO ? s : memorySession(account, {}, backend);
}

const section = (name: RegExp) => screen.getByRole('group', { name });

/** Done and archived activities are under two closed rows at the bottom of the group's list. */
test('testGroupPageListsDoneAndArchivedApart', async () => {
  renderWithSession(<GroupPage groupId="inv:developers" onOpen={() => undefined} />, await withClosed());
  await screen.findByText('Analisi costi');
  expect(within(section(/^Fatte \(1\)/)).getByText('demo fatta')).toBeTruthy();
  expect(within(section(/^Archiviate \(1\)/)).getByText('vecchia idea')).toBeTruthy();
  expect(within(screen.getByRole('region', { name: 'Elenco di developers' })).queryByText('vecchia idea')).toBeNull();
});

test('testReopenPutsItBackAmongTheOpenOnes', async () => {
  const s = await withClosed();
  renderWithSession(<GroupPage groupId="inv:developers" onOpen={() => undefined} />, s);
  await screen.findByText('vecchia idea');
  fireEvent.click(screen.getByRole('button', { name: 'Riapri vecchia idea' }));
  await waitFor(async () => expect((await s.primary.getActivity('old')).activity.status).toBe('open'));
  const list = screen.getByRole('region', { name: 'Elenco di developers' });
  expect(await within(list).findByText('vecchia idea')).toBeTruthy();
  expect(screen.queryByRole('group', { name: /^Archiviate/ })).toBeNull();
});

test('testGuestCannotReopen', async () => {
  renderWithSession(<GroupPage groupId="inv:developers" onOpen={() => undefined} />, await withClosed(OSPITE));
  await screen.findByText('vecchia idea');
  expect(screen.queryByRole('button', { name: /^Riapri/ })).toBeNull();
});

/** Io keeps the person's own closed things: the personal group's and the archived drafts. */
test('testIoListsItsClosedThings', async () => {
  renderWithSession(<MeView />, await withClosed());
  await screen.findByText('libro letto');
  const archived = section(/^Archiviate \(2\)/);
  expect(within(archived).getByText('libro letto')).toBeTruthy();
  expect(within(archived).getByText('bozza scartata')).toBeTruthy();
});

/** A closed activity opens read only: what it was and its history, no actions and no properties to add. */
test('testClosedActivityOpensReadOnly', async () => {
  renderWithSession(<ActivityDetail activityId="old" onClose={() => undefined} />, await withClosed());
  expect(await screen.findByRole('heading', { name: 'vecchia idea' })).toBeTruthy();
  expect(screen.getByText('archiviata')).toBeTruthy();
  expect(screen.queryByLabelText('Titolo')).toBeNull();
  expect(screen.queryByText(/Aggiungi proprietà/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archivia' })).toBeNull();
  expect(screen.getByText('Storico')).toBeTruthy();
});

/** Its author sends a group's activity back among the drafts; the others in the group stop seeing it. */
test('testAuthorSendsAnActivityBackAmongTheDrafts', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByLabelText('Titolo');
  fireEvent.click(screen.getByRole('button', { name: 'Torna bozza' }));
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.groupId).toBeNull());
  const d = (await s.primary.getActivity('costi')).activity;
  expect(d.props.assignment).toBeUndefined();
  expect(d.history.at(-1)?.kind).toBe('movedToDrafts');
});

test('testOnlyTheAuthorSeesTorna', async () => {
  renderWithSession(<ActivityDetail activityId="doc" onClose={() => undefined} />, memorySession(PIPPO));
  await screen.findByLabelText('Titolo');
  expect(screen.queryByRole('button', { name: 'Torna bozza' })).toBeNull();
});

/** Where it is can be changed by its author: the row opens the group choice, without the group it is in. */
test('testAuthorMovesAnActivityToAnotherGroup', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByLabelText('Titolo');
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Dove' }));
  const select = screen.getByLabelText('Gruppo') as HTMLSelectElement;
  expect([...select.options].map(o => o.textContent)).toEqual(['Idee personali', 'altereos.com']);
  fireEvent.change(select, { target: { value: 'domain:altereos.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sposta' }));
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.groupId).toBe('domain:altereos.com'));
  expect((await s.primary.getActivity('costi')).activity.props.assignment).toBeUndefined();
});

test('testOthersCannotMoveIt', async () => {
  renderWithSession(<ActivityDetail activityId="doc" onClose={() => undefined} />, memorySession(PIPPO));
  await screen.findByLabelText('Titolo');
  expect(screen.queryByRole('button', { name: 'Modifica Dove' })).toBeNull();
});

/**
 * Found in the browser: the group choice stayed open after the activity was archived from another tab, so a read-only
 * detail offered Sposta. An open form now closes when the activity stops being editable.
 */
test('testOpenFormClosesWhenTheActivityIsArchivedMeanwhile', async () => {
  const s = memorySession(PIPPO, { refreshIntervalSeconds: 1 });
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByLabelText('Titolo');
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Dove' }));
  expect(screen.getByRole('button', { name: 'Sposta' })).toBeTruthy();
  const stored = (await s.primary.getActivity('costi')).activity;
  await s.primary.saveActivity(archive(stored, PIPPO, T), stored.version);
  await screen.findByText('archiviata', {}, { timeout: 3000 });
  expect(screen.queryByRole('button', { name: 'Sposta' })).toBeNull();
});

/** The role used to show as stored ("owner"): it reads in Italian, as on the group cards. */
test('testDoveSaysTheRoleInItalian', async () => {
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, memorySession(PIPPO));
  expect(await screen.findByText('developers · tu: proprietario')).toBeTruthy();
});

/** Whoever has it accepted lets it go from the detail; the reason may stay empty. */
test('testAssigneeReleasesIt', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  await screen.findByLabelText('Titolo');
  fireEvent.click(screen.getByRole('button', { name: 'Lascia…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Lascia' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.props.assignment).toBeUndefined());
  expect((await s.primary.getActivity('backup')).activity.history.at(-1)?.kind).toBe('released');
});

/** Who edits the group changes the assignee from the Assegna row. */
test('testEditorChangesTheAssignee', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="backup" onClose={() => undefined} />, s);
  await screen.findByLabelText('Titolo');
  fireEvent.click(screen.getByRole('button', { name: 'Modifica Assegna' }));
  const select = screen.getByLabelText('Assegna a') as HTMLSelectElement;
  expect(select.value).toBe(PIPPO);
  fireEvent.change(select, { target: { value: 'pluto@altereos.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salva' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.props.assignment)
    .toEqual({ state: 'proposed', assignee: 'pluto@altereos.com', assignedBy: PIPPO }));
});

/** Only Accetta is highlighted: someone is waiting for the answer. Completing or unblocking are ordinary buttons. */
test('testOnlyAccettaIsHighlighted', async () => {
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, memorySession('pluto@altereos.com'));
  expect((await screen.findByRole('button', { name: 'Accetta' })).classList.contains('primary')).toBe(true);
  expect(screen.getByRole('button', { name: 'Fatto' }).classList.contains('primary')).toBe(false);
});
