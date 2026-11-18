import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { costTask, inviteGroup } from '@attivita/core/test/fixtures';
import { newActivity } from '@attivita/core';
import type { Activity } from '@attivita/core';
import { enqueueDraft } from '../src/offline/outbox.js';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { availableActions } from '../src/activity/actions.js';
import { DraftsView } from '../src/drafts/DraftsView.js';
import { seedUsage } from '../src/usage/usageStore.js';
import { PIPPO, PLUTO, benchBackend, memorySession, renderWithSession, userClick, userType, pickDate } from './memory-session.js';

test('testAvailableActionsForGuest', () => {
  const mine: Activity = { ...costTask, props: { ...costTask.props, assignment: { state: 'accepted', assignee: 'guest1', assignedBy: 'u1' } } };
  // A guest may let go of what it accepted, as both engines let it update its own assignment.
  expect(availableActions(mine, null, inviteGroup, 'guest1')).toEqual(['release', 'complete']);
  expect(availableActions(costTask, null, inviteGroup, 'guest1')).toEqual([]);
});

test('testAvailableActionsForDraft', () => {
  const draft: Activity = { ...costTask, groupId: null, props: {} };
  expect(availableActions(draft, null, null, 'u1')).toEqual(['moveToGroup', 'decompose', 'snooze', 'archive']);
});

test('testRejectNeedsReason', async () => {
  const s = memorySession(PLUTO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick('Rifiuta…');
  const go = screen.getByRole('button', { name: 'Rifiuta' }) as HTMLButtonElement;
  expect(go.disabled).toBe(true);
  userType(screen.getByLabelText('Motivo'), '   ');
  expect(go.disabled).toBe(true);
  userType(screen.getByLabelText('Motivo'), 'non ho tempo');
  userClick('Rifiuta');
  userClick('Storico');
  expect(await screen.findByText(/pluto ha rifiutato: non ho tempo/)).toBeTruthy();
  expect((await s.primary.getActivity('costi')).activity.props.assignment).toBeUndefined();
});

test('testChipsFollowUsage', async () => {
  seedUsage(PIPPO, { waitingFor: 3 });
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  const chips = screen.getAllByRole('button', { name: /^\+ / });
  expect(chips[0]?.textContent).toMatch(/Gruppo/);
  expect(chips[1]?.textContent).toMatch(/In attesa di/);
});

test('testAddDueDateTurnsIdeaIntoTask', async () => {
  const s = memorySession();
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'app gestione core' });
  userClick('+ Gruppo');
  fireEvent.click(within(screen.getByRole('menu', { name: 'Gruppo' })).getByRole('menuitemradio', { name: 'Personale' }));
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.groupId).toBe(`personal:${PIPPO}`));
  userClick(/^\+ Scadenza/);
  pickDate('Scadenza', '2026-11-20');
  expect(await screen.findByText('cosa da fare')).toBeTruthy();
});

test('testCoverOccurrenceKeepsSeries', async () => {
  const s = memorySession(PLUTO);
  renderWithSession(<ActivityDetail activityId="backup" occurrenceKey="2026-11-05T09:00" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Controllo backup' });
  userClick('Copro io questa');
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.overrides['2026-11-05T09:00']?.assignee).toBe(PLUTO));
  expect((await s.primary.getActivity('backup')).activity.props.assignment?.assignee).toBe(PIPPO);
});

/**
 * «Lascia questa volta» gives back the occurrence covered (user's bug, 2026-11-17: after «Copro io questa» nothing let
 * it go): the occurrence is the series' assignee's again.
 */
test('testLeaveTheCoveredOccurrence', async () => {
  const s = memorySession(PLUTO);
  renderWithSession(<ActivityDetail activityId="backup" occurrenceKey="2026-11-05T09:00" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Controllo backup' });
  expect(screen.queryByRole('button', { name: 'Lascia questa volta' })).toBeNull();
  userClick('Copro io questa');
  fireEvent.click(await screen.findByRole('button', { name: 'Lascia questa volta' }));
  await waitFor(async () => expect((await s.primary.getActivity('backup')).activity.overrides['2026-11-05T09:00']).toBeUndefined());
  expect(await screen.findByRole('button', { name: 'Copro io questa' })).toBeTruthy();
});

/** Found in the manual offline check: a draft still in the outbox was missing from the list, as if lost. */
test('testQueuedDraftIsListedAsWaitingForNetwork', async () => {
  const s = memorySession(PLUTO);
  const t = '2026-11-04T08:00:00Z';
  await enqueueDraft(s.outbox, PLUTO, newActivity({ id: 'q1', accountId: PLUTO, title: 'idea senza rete' }, t), [], t);
  renderWithSession(<DraftsView onOpen={() => undefined} />, s);
  expect(await screen.findByText('idea senza rete')).toBeTruthy();
  expect(screen.getByText('in attesa di rete')).toBeTruthy();
});

test('testDraftsListShowsOnlyMine', async () => {
  renderWithSession(<DraftsView onOpen={() => undefined} />, memorySession(PLUTO));
  expect(await screen.findByText(/Nessuna bozza/)).toBeTruthy();
});

/** The history is closed under a «Storico» row, as the ticked items: it is read seldom and takes room. */
test('testHistoryClosedUntilOpened', async () => {
  renderWithSession(<ActivityDetail activityId="idea" onClose={() => undefined} />, memorySession());
  await screen.findByRole('heading', { name: 'app gestione core' });
  const row = screen.getByRole('button', { name: 'Storico' });
  expect(row.getAttribute('aria-expanded')).toBe('false');
  expect(screen.queryByText(/l'ha creata/)).toBeNull();
  userClick('Storico');
  expect(row.getAttribute('aria-expanded')).toBe('true');
  expect(screen.getByText(/l'ha creata/)).toBeTruthy();
});

/**
 * The text saved on leaving the field and a button tapped at once (user's bug, 2026-11-17): before, the second save
 * left from the same version, was refused as «Qualcun altro l'ha appena modificata» and the archive was lost. Now the
 * detail saves one after the other and puts the second change on the version it has just saved.
 */
test('testTextThenArchiveAtOnceKeepsBoth', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  const body = screen.getByLabelText('Testo');
  fireEvent.change(body, { target: { value: 'una nota nuova' } });
  fireEvent.blur(body);
  fireEvent.click(screen.getByRole('button', { name: 'Archivia' }));
  await waitFor(async () => expect((await s.primary.getActivity('costi')).activity.status).toBe('archived'));
  expect((await s.primary.getActivity('costi')).activity.body).toBe('una nota nuova');
  expect(screen.queryByText(/Qualcun altro/)).toBeNull();
});

/** A change by someone else meanwhile stays a conflict: the message, and nothing of theirs overwritten. */
test('testSomeoneElsesChangeStaysAConflict', async () => {
  const s = memorySession(PIPPO);
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  const { activity } = await s.primary.getActivity('costi');
  await s.primary.saveActivity({ ...activity, title: 'Analisi costi 2027' }, activity.version);
  fireEvent.click(screen.getByRole('button', { name: 'Archivia' }));
  expect(await screen.findByText(/Qualcun altro/)).toBeTruthy();
  expect((await s.primary.getActivity('costi')).activity.status).toBe('open');
});

/**
 * A snooze whose time has come is over in the detail too, as in the Agenda (user's bug, 2026-11-18): before, the detail
 * said «rimandata» until something was saved. One still to come says it.
 */
test('testDetailSaysASnoozeIsOverOnceItsTimeHasCome', async () => {
  const backend = benchBackend();
  const base = newActivity({ id: 'riposo', accountId: PIPPO, title: 'Riposo', groupId: 'inv:developers' }, '2026-11-01T08:00:00Z');
  backend.activities.set('riposo', { ...base, props: { resumeAt: '2020-01-01' } });
  backend.activities.set('dopo', { ...base, id: 'dopo', title: 'Dopo', props: { resumeAt: '2999-01-01' } });
  const s = memorySession(PIPPO, {}, backend);
  const { unmount } = renderWithSession(<ActivityDetail activityId="riposo" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Riposo' });
  expect(screen.queryByText('rimandata')).toBeNull();
  expect(screen.getByText('idea')).toBeTruthy();
  unmount();
  renderWithSession(<ActivityDetail activityId="dopo" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Dopo' });
  expect(screen.getByText('rimandata')).toBeTruthy();
});
