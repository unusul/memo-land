import { DomainError, EngineUnavailableError } from '@attivita/core';

const UNREACHABLE = new Set(['unavailable', 'deadline-exceeded']);
const LOST_RACE = new Set(['aborted', 'failed-precondition']);

/**
 * Maps a Firestore error onto the core errors. Only inside a transaction do aborted/failed-precondition mean
 * a concurrent write; elsewhere failed-precondition is e.g. a missing index and must surface as is.
 */
export function toDomainError(e: unknown, opts: { inTransaction?: boolean } = {}): Error {
  if (e instanceof DomainError || e instanceof EngineUnavailableError) return e;
  const code = typeof e === 'object' && e !== null && 'code' in e ? String((e as { code: unknown }).code) : '';
  const message = e instanceof Error ? e.message : String(e);
  if (code === 'permission-denied') return new DomainError('FORBIDDEN', message);
  if (code === 'not-found') return new DomainError('NOT_FOUND', message);
  if (code === 'invalid-argument') return new DomainError('INVALID_INPUT', message);
  if (UNREACHABLE.has(code)) return new EngineUnavailableError(message);
  if (opts.inTransaction && LOST_RACE.has(code)) return new DomainError('VERSION_CONFLICT', message);
  return e instanceof Error ? e : new Error(message);
}
