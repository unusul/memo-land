import { fireEvent, screen } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { SettingsView } from '../src/settings/SettingsView.js';
import { applyTheme, loadTheme } from '../src/settings/theme.js';
import { PIPPO, memorySession, renderWithSession } from './memory-session.js';

const choose = (name: string) => fireEvent.click(screen.getByRole('radio', { name }));

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

const pressed = () => screen.getAllByRole('radio').filter(b => b.getAttribute('aria-checked') === 'true').map(b => b.getAttribute('aria-label'));

/** Automatico follows the system and is the default; Chiaro and Scuro force the theme and are kept in this browser. */
test('testThemeChoiceIsAppliedAndKept', () => {
  renderWithSession(<SettingsView />, memorySession(PIPPO));
  expect(pressed()).toEqual(['Automatico']);
  choose('Scuro');
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(loadTheme()).toBe('dark');
  expect(pressed()).toEqual(['Scuro']);
  choose('Chiaro');
  expect(document.documentElement.dataset.theme).toBe('light');
  choose('Automatico');
  expect(document.documentElement.dataset.theme).toBeUndefined();
  expect(loadTheme()).toBe('auto');
});

/** The phone's status bar takes the forced theme's colour too. */
test('testForcedThemeSetsTheBrowserBarColour', () => {
  document.head.innerHTML = '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#1b1e28" media="(prefers-color-scheme: dark)">';
  applyTheme('dark');
  expect([...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.getAttribute('content'))).toEqual(['#1b1e28', '#1b1e28']);
  applyTheme('auto');
  expect([...document.querySelectorAll('meta[name="theme-color"]')].map(m => m.getAttribute('content'))).toEqual(['#ffffff', '#1b1e28']);
});
