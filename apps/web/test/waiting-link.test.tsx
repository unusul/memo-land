import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { newActivity } from '@attivita/core';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { Shell } from '../src/shell/Shell.js';
import { PIPPO, benchBackend, memorySession, renderWithSession, userClick, userType } from './memory-session.js';

beforeEach(() => localStorage.clear());

async function waitingForm(s = memorySession()) {
  renderWithSession(<ActivityDetail activityId="costi" onClose={() => undefined} />, s);
  await screen.findByRole('heading', { name: 'Analisi costi' });
  userClick('+ In attesa di…');
  return s;
}

const stored = async (s: ReturnType<typeof memorySession>, id = 'costi') => (await s.primary.getActivity(id)).activity;

/** «In attesa di» an activity chosen among the open ones: the condition becomes its title. */
test('testWaitingForAChosenActivity', async () => {
  const s = await waitingForm();
  fireEvent.change(screen.getByLabelText("Scegli un'attività"), { target: { value: 'sal' } });
  expect((screen.getByLabelText('Condizione') as HTMLInputElement).value).toBe('Stato avanzamento');
  userClick('Aggiungi');
  await waitFor(async () => expect((await stored(s)).props.waitingFor).toEqual({ condition: 'Stato avanzamento', activityId: 'sal' }));
});

/** Or a new one, made from the sentence typed, in the same group. */
test('testWaitingForANewActivity', async () => {
  const s = await waitingForm();
  userType(screen.getByLabelText('Condizione'), 'Firma del legale');
  userClick('Creane una nuova');
  await waitFor(async () => expect((await s.primary.listActivities('inv:developers')).map(a => a.title)).toContain('Firma del legale'));
  const made = (await s.primary.listActivities('inv:developers')).find(a => a.title === 'Firma del legale')!;
  userClick('Aggiungi');
  await waitFor(async () => expect((await stored(s)).props.waitingFor).toEqual({ condition: 'Firma del legale', activityId: made.id }));
});

/** Typing over the title lets the activity go: the sentence is one's own again. */
test('testTypingLetsTheActivityGo', async () => {
  const s = await waitingForm();
  fireEvent.change(screen.getByLabelText("Scegli un'attività"), { target: { value: 'sal' } });
  userType(screen.getByLabelText('Condizione'), 'altro');
  userClick('Aggiungi');
  await waitFor(async () => expect((await stored(s)).props.waitingFor).toEqual({ condition: 'altro' }));
});

/** When the activity waited for is done, the condition comes true by itself as the app opens. */
test('testDoneActivityMakesTheWaitComeTrue', async () => {
  const backend = benchBackend();
  backend.activities.set('firma', { ...newActivity({ id: 'firma', accountId: PIPPO, title: 'Firma', groupId: 'inv:developers' }, '2026-11-01T08:00:00Z'), status: 'done' });
  const costi = backend.activities.get('costi')!;
  costi.props = { ...costi.props, waitingFor: { condition: 'Firma', activityId: 'firma' } };
  const s = memorySession(PIPPO, {}, backend);
  renderWithSession(<Shell />, s);
  await waitFor(async () => expect((await stored(s)).props.waitingFor).toMatchObject({ metBy: PIPPO }));
  expect((await stored(s)).history.at(-1)?.kind).toBe('conditionMet');
});
