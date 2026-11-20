import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { expect, test, vi } from 'vitest';
import { TimeField, nearestHalfHour, parseTime } from '../src/shell/TimeField.js';

/** A time as written by hand (user's choice, 2026-11-20, after Tempo): the short forms, and what is not a time. */
test('testParseTime', () => {
  expect(['9', '930', '9.30', '9,30', '9h30', '09:30', ' 21:15 ', '0', '2359'].map(parseTime))
    .toEqual(['09:00', '09:30', '09:30', '09:30', '09:30', '09:30', '21:15', '00:00', '23:59']);
  expect(['', 'abc', '24', '960', '9:5', '12345', '-1'].map(parseTime)).toEqual([null, null, null, null, null, null, null]);
});

test('testNearestHalfHour', () => {
  expect(['08:45', '08:44', '08:46', '23:59', '', '00:10'].map(nearestHalfHour)).toEqual(['08:30', '08:30', '09:00', '23:30', '09:00', '00:00']);
});

function Field({ start = '09:00', allowEmpty = false, spy }: { start?: string; allowEmpty?: boolean; spy(t: string): void }) {
  const [v, setV] = useState(start);
  return <TimeField label="Ora" value={v} allowEmpty={allowEmpty} onChange={t => { spy(t); setV(t); }} />;
}
const field = () => screen.getByRole('combobox', { name: 'Ora' }) as HTMLInputElement;

/**
 * The field (2026-11-20): a full «HH:MM» goes out at once, a short form when the field is left or with Enter, what is not
 * a time goes back; empty only with `allowEmpty`. Before, the browser's time field, which takes no «930».
 */
test('testTheFieldTakesWhatIsWritten', () => {
  const spy = vi.fn();
  render(<Field spy={spy} />);
  fireEvent.change(field(), { target: { value: '10:15' } });
  expect(spy).toHaveBeenLastCalledWith('10:15');
  fireEvent.change(field(), { target: { value: '930' } });
  expect(spy).toHaveBeenCalledTimes(1);
  fireEvent.blur(field());
  expect(spy).toHaveBeenLastCalledWith('09:30');
  expect(field().value).toBe('09:30');
  fireEvent.change(field(), { target: { value: '21.5' } });
  fireEvent.blur(field());
  expect(field().value).toBe('09:30');
  fireEvent.change(field(), { target: { value: '18' } });
  fireEvent.keyDown(field(), { key: 'Enter' });
  expect(field().value).toBe('18:00');
  fireEvent.change(field(), { target: { value: '' } });
  fireEvent.blur(field());
  expect(field().value).toBe('18:00');
  expect(spy.mock.calls.map(c => c[0])).toEqual(['10:15', '09:30', '18:00']);
});

test('testAnEmptyFieldWhenAllowed', () => {
  const spy = vi.fn();
  render(<Field spy={spy} start="10:00" allowEmpty />);
  fireEvent.change(field(), { target: { value: '' } });
  expect(spy).toHaveBeenLastCalledWith('');
  expect(field().value).toBe('');
});

/** An end not before its start (user's request, 2026-11-20): the list starts after it, an earlier time goes back. */
test('testOnlyTimesAfterTheStart', () => {
  const spy = vi.fn();
  render(<TimeField label="Fine" value="10:00" after="09:00" onChange={spy} />);
  const end = screen.getByRole('combobox', { name: 'Fine' }) as HTMLInputElement;
  fireEvent.click(end);
  expect(screen.getAllByRole('option')[0]?.textContent).toBe('9:30');
  fireEvent.change(end, { target: { value: '08:30' } });
  fireEvent.blur(end);
  expect(end.value).toBe('10:00');
  fireEvent.change(end, { target: { value: '09:00' } });
  fireEvent.blur(end);
  expect(end.value).toBe('10:00');
  expect(screen.queryByRole('option', { name: '8:30' })).toBeNull();
  fireEvent.change(end, { target: { value: '9.15' } });
  fireEvent.blur(end);
  expect(spy.mock.calls.map(c => c[0])).toEqual(['09:15']);
});

/** A tap opens the half hours, the one set marked; a choice sets it and closes the list; Esc closes it too. */
test('testTheListOfHalfHours', () => {
  const spy = vi.fn();
  render(<Field spy={spy} start="08:30" />);
  fireEvent.focus(field());
  const list = screen.getByRole('listbox', { name: 'Ora' });
  expect(list.querySelectorAll('[role=option]')).toHaveLength(48);
  expect(screen.getByRole('option', { selected: true }).textContent).toBe('8:30');
  fireEvent.click(screen.getByRole('option', { name: '14:00' }));
  expect(spy).toHaveBeenLastCalledWith('14:00');
  expect(screen.queryByRole('listbox')).toBeNull();
  fireEvent.click(field());
  expect(screen.getByRole('option', { selected: true }).textContent).toBe('14:00');
  fireEvent.keyDown(field(), { key: 'Escape' });
  expect(screen.queryByRole('listbox')).toBeNull();
});

/** An empty end opens its list just after the start, not on 09:00 (Ripeti, 18:00–: 18:30 in the middle). */
test('testAnEmptyEndOpensAfterTheStart', () => {
  render(<TimeField label="Fine" value="" after="18:00" allowEmpty onChange={() => undefined} />);
  fireEvent.click(screen.getByRole('combobox', { name: 'Fine' }));
  expect(screen.getByRole('listbox').querySelector('[data-near="true"]')?.textContent).toBe('18:30');
});
