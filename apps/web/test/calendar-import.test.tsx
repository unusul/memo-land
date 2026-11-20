import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SettingsView } from '../src/settings/SettingsView.js';
import { PIPPO, benchBackend, chooseIn, memorySession, renderWithSession } from './memory-session.js';

/*
 * Impostazioni → Import (user's choices, 2026-11-20): a Google Calendar file into one group, Personale first, with a
 * preview that says what comes in and what is left out; each event can be taken out. Dates far ahead, so the test does
 * not age; the reading itself is covered in core (ics-import.test.ts).
 */

const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
UID:a
SUMMARY:Dentista
DTSTART;TZID=Europe/Rome:20991125T100000
DTEND;TZID=Europe/Rome:20991125T110000
BEGIN:VALARM
TRIGGER:-PT30M
END:VALARM
END:VEVENT
BEGIN:VEVENT
UID:b
SUMMARY:Palestra
DTSTART;TZID=Europe/Rome:20240101T183000
RRULE:FREQ=WEEKLY;BYDAY=MO
END:VEVENT
BEGIN:VEVENT
UID:c
SUMMARY:Vecchia riunione
DTSTART;TZID=Europe/Rome:20200110T090000
END:VEVENT
END:VCALENDAR
`;

async function openFile(backend = benchBackend()) {
  renderWithSession(<SettingsView />, memorySession(PIPPO, {}, backend));
  const file = new File([ics], 'prova.ics', { type: 'text/calendar' });
  fireEvent.change(screen.getByLabelText('File del calendario'), { target: { files: [file] } });
  return screen.findByRole('dialog', { name: 'Importa calendario' });
}

test('testThePreviewSaysWhatComesIn', async () => {
  const panel = await openFile();
  expect(within(panel).getByText('2 eventi da importare, di cui 1 serie.')).toBeTruthy();
  expect(within(panel).getByText('Saltati: 1 passato')).toBeTruthy();
  expect(within(panel).getByText(/si ripete · prossima lun \d+ /)).toBeTruthy();
  expect(within(panel).getByText(/promemoria di Google non vengono importati/)).toBeTruthy();
  expect(within(panel).getByRole('button', { name: 'Gruppo' }).textContent).toContain('Personale');
});

test('testTheEventsGoIntoTheGroupChosen', async () => {
  const backend = benchBackend();
  const panel = await openFile(backend);
  chooseIn('Gruppo', 'domain:altereos.com');
  fireEvent.click(within(panel).getByRole('checkbox', { name: /Palestra/ }));
  expect(within(panel).getByText('1 evento da importare, di cui 1 serie.')).toBeTruthy();
  fireEvent.click(within(panel).getByRole('button', { name: 'Importa' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importa calendario' })).toBeNull());
  const imported = [...backend.activities.values()].filter(a => a.title === 'Dentista' || a.title === 'Palestra');
  expect(imported.map(a => [a.title, a.groupId, a.props.schedule?.start])).toEqual([['Dentista', 'domain:altereos.com', '2099-11-25T10:00']]);
});

/** A second import of the same file finds everything already there. */
test('testASecondImportFindsTheDoubles', async () => {
  const backend = benchBackend();
  let panel = await openFile(backend);
  fireEvent.click(within(panel).getByRole('button', { name: 'Importa' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Importa calendario' })).toBeNull());
  fireEvent.change(screen.getByLabelText('File del calendario'), { target: { files: [new File([ics], 'prova.ics')] } });
  panel = await screen.findByRole('dialog', { name: 'Importa calendario' });
  expect(within(panel).getByText('Niente da importare.')).toBeTruthy();
  expect(within(panel).getByText(/2 già presenti/)).toBeTruthy();
});
