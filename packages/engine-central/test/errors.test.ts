import { expect, test } from 'vitest';
import { DomainError, EngineUnavailableError } from '@attivita/core';
import { toDomainError } from '../src/index.js';

/** The app falls back to offline only for network failures; other server errors must surface. */
test('testNetworkFailuresMapToEngineUnavailable', () => {
  expect(toDomainError({ message: 'TypeError: Failed to fetch', code: '' })).toBeInstanceOf(EngineUnavailableError);
  expect(toDomainError({ message: 'fetch failed' })).toBeInstanceOf(EngineUnavailableError);
  const jwt = toDomainError({ message: 'JWT expired', code: 'PGRST301' });
  expect(jwt).not.toBeInstanceOf(EngineUnavailableError);
  expect(jwt).not.toBeInstanceOf(DomainError);
  expect(toDomainError({ message: 'FORBIDDEN', details: 'x' })).toMatchObject({ code: 'FORBIDDEN' });
});
