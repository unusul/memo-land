import { screen, waitFor } from '@testing-library/react';
import { expect, test } from 'vitest';
import { costTask, inviteGroup } from '@attivita/core/test/fixtures';
import { newActivity } from '@attivita/core';
import type { Activity } from '@attivita/core';
import { enqueueDraft } from '../src/offline/outbox.js';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { availableActions } from '../src/activity/actions.js';
import { DraftsView } from '../src/drafts/DraftsView.js';
import { seedUsage } from '../src/usage/usageStore.js';
import { PIPPO, PLUTO, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

test('testAvailableActionsForGuest', () => {
  const mine: Activity = { ...costTask, props: { ...costTask.props, assignment: { state: 'accepted', assignee: 'guest1', assignedBy: 'u1' } } };
  expect(availableActions(mine, null, inviteGroup, 'guest1')).toEqual(['complete']);
  expect(availableActions(costTask, null, inviteGroup, 'guest1')).toEqual([]);
});

test('testAvailableActionsForDraft', () => {
  const draft: Activity = { ...costTask, groupId: null, props: {} };
  expect(availableActions(draft, null, null, 'u1')).toEqual(['moveToGroup', 'keepAsIdea', 'decompose', 'snooze', 'archive']);
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
  userClick('Aggiungi');
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.groupId).toBe(`personal:${PIPPO}`));
  userClick(/^\+ Scadenza/);
  userType(screen.getByLabelText('Scadenza'), '2026-11-20');
  userClick('Aggiungi');
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
