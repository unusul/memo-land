import { expect, test } from 'vitest';
import { FirebaseError } from 'firebase/app';
import { DomainError, EngineUnavailableError } from '@attivita/core';
import { toDomainError } from '../src/index.js';

/** The app falls back to offline only when Firestore cannot be reached; a transaction lost to a race is a conflict. */
test('testFirebaseErrorsMapToDomainErrors', () => {
  expect(toDomainError(new FirebaseError('permission-denied', 'no'))).toMatchObject({ code: 'FORBIDDEN' });
  expect(toDomainError(new FirebaseError('unavailable', 'offline'))).toBeInstanceOf(EngineUnavailableError);
  expect(toDomainError(new FirebaseError('aborted', 'race'), { inTransaction: true })).toMatchObject({ code: 'VERSION_CONFLICT' });
  // Outside a transaction failed-precondition means e.g. a missing index: not a conflict.
  const index = toDomainError(new FirebaseError('failed-precondition', 'needs an index'));
  expect(index).not.toBeInstanceOf(DomainError);
  expect(index.message).toMatch(/index/);
  const own = new DomainError('VERSION_CONFLICT', 'mine');
  expect(toDomainError(own)).toBe(own);
});
