import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { appHome } from '../src/appHome.js';

/**
 * The sign-in link and the provider login sent people back to `window.location.origin`: on GitHub Pages that is
 * https://unusul.github.io, without /memo-land/, so they landed outside the app. They go back to the app's own address.
 */
test('testAppHomeKeepsTheBasePath', () => {
  expect(appHome('https://unusul.github.io', '/memo-land/')).toBe('https://unusul.github.io/memo-land/');
  expect(appHome('http://localhost:5173', '/')).toBe('http://localhost:5173/');
});

test('testSignInReturnsToTheAppHome', () => {
  const central = readFileSync(join(__dirname, '../src/session/central.ts'), 'utf8');
  expect(central).not.toMatch(/window\.location\.origin/);
  expect(central.match(/appHome\(\)/g)).toHaveLength(2);
});
