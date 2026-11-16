import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { ActivityDetail } from '../src/activity/ActivityDetail.js';
import { Shell } from '../src/shell/Shell.js';
import { PLUTO, memorySession, renderWithSession, userClick, userType, pickDate, pickDateTime } from './memory-session.js';

beforeEach(() => localStorage.clear());

async function open(id: string, title: string) {
  const s = memorySession();
  const onClose = vi.fn();
  renderWithSession(<ActivityDetail activityId={id} onClose={onClose} />, s);
  await screen.findByDisplayValue(title);
  return { s, onClose };
}

test('testTitleSavesWhenLeavingTheField', async () => {
  const { s } = await open('idea', 'app gestione core');
  const title = screen.getByLabelText('Titolo');
  userType(title, 'app memo-land');
  fireEvent.blur(title);
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.title).toBe('app memo-land'));
});

test('testTextSavesWhenLeavingTheField', async () => {
  const { s } = await open('idea', 'app gestione core');
  const body = screen.getByLabelText('Testo');
  userType(body, 'Idea avuta durante la corsa, con i dettagli.');
  fireEvent.blur(body);
  await waitFor(async () => expect((await s.primary.getActivity('idea')).activity.body).toBe('Idea avuta durante la corsa, con i dettagli.'));
});

test('testEmptyTitleIsNotSaved', async () => {
  const { s } = await open('idea', 'app gestione core');
  const title = screen.getByLabelText('Titolo') as HTMLInputElement;
  userType(title, '  ');
  fireEvent.blur(title);
  await waitFor(() => expect(title.value).toBe('app gestione core'));
  expect((await s.primary.getActivity('idea')).activity.title).toBe('app gestione core');
});

/**
 * Before, Chiudi dropped a changed form without a word: the new date was lost. Data e ora keeps its form; Scadenza is
 * a menu now (2026-11-16) and saves at once, so it leaves nothing open.
 */
test('testCloseSavesAnOpenChangedForm', async () => {
  const { s, onClose } = await open('costi', 'Analisi costi');
  userClick(/^\+ Data e ora/);
  pickDateTime('Data e ora', '2026-11-10T10:10');
  userClick('Indietro');
  await waitFor(() => expect(onClose).toHaveBeenCalledWith('Data e ora salvata'));
  expect((await s.primary.getActivity('costi')).activity.props.schedule?.start).toBe('2026-11-10T10:10');
});

test('testCloseSavesANewRepeat', async () => {
  const { s, onClose } = await open('idea', 'app gestione core');
  userClick(/^\+ Ripeti/);
  userType(screen.getByLabelText('Ogni'), '2');
  userClick('Indietro');
  await waitFor(() => expect(onClose).toHaveBeenCalledWith('Ripeti salvato'));
  expect((await s.primary.getActivity('idea')).activity.props.repeat).toEqual({ mode: 'calendar', rrule: expect.stringMatching(/^FREQ=WEEKLY;INTERVAL=2;BYDAY=/) });
});

test('testCloseWithAnUnchangedFormSavesNothing', async () => {
  const { s, onClose } = await open('sal', 'Stato avanzamento');
  const before = (await s.primary.getActivity('sal')).activity.version;
  userClick('Modifica Data e ora');
  userClick('Indietro');
  await waitFor(() => expect(onClose).toHaveBeenCalledWith(undefined));
  expect((await s.primary.getActivity('sal')).activity.version).toBe(before);
});

test('testShellSaysWhatChiudiSaved', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 11, 9, 0));
  // Pluto finds "Analisi costi" among the overdue ones (due 6 Nov, proposed to him).
  renderWithSession(<Shell />, memorySession(PLUTO));
  fireEvent.click((await screen.findAllByText('Analisi costi'))[0]!);
  userClick(/^\+ Data e ora/);
  pickDateTime('Data e ora', '2026-11-10T10:10');
  userClick('Indietro');
  expect(await screen.findByText('Data e ora salvata')).toBeTruthy();
  vi.useRealTimers();
});
