import { screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { SettingsView } from '../src/settings/SettingsView.js';
import { versionLine } from '../src/settings/version.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

/** The day is the one written in the commit date, whatever the time zone of the phone reading it. */
test('testVersionLineShowsNumberAndDayOfTheLastCommit', () => {
  expect(versionLine('0.2.0', '2026-11-16T23:40:00+01:00')).toBe('memo-land 0.2.0 · 16/11/2026');
});

/** No date when the build had no git to ask (a copy without history): the number alone. */
test('testVersionLineWithoutDateShowsTheNumberAlone', () => {
  expect(versionLine('0.2.0', '')).toBe('memo-land 0.2.0');
});

/** Impostazioni ends with the line, filled at build time from package.json and the last commit. */
test('testSettingsShowTheVersionLine', () => {
  renderWithSession(<SettingsView />, memorySession(PIPPO));
  expect(screen.getByText(/^memo-land \d+\.\d+\.\d+ · \d{2}\/\d{2}\/\d{4}$/)).toBeTruthy();
});
