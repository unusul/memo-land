import { DomainError, EngineUnavailableError } from '@attivita/core';
import type { DomainErrorCode } from '@attivita/core';

const SERVER_CODES: readonly DomainErrorCode[] = ['VERSION_CONFLICT', 'FORBIDDEN', 'NOT_FOUND', 'INVALID_INPUT'];
const NETWORK = /failed to fetch|fetch failed|networkerror|network request failed|load failed/i;

/** Maps a Supabase/PostgREST error onto the core errors: our SQL codes, network failures, or a plain Error. */
export function toDomainError(e: { message?: string; details?: string | null; code?: string }): Error {
  const code = SERVER_CODES.find(c => e.message === c);
  if (code) return new DomainError(code, e.details || e.message || code);
  if (NETWORK.test(e.message ?? '')) return new EngineUnavailableError(e.message ?? 'engine unreachable');
  return new Error(e.message ?? 'unexpected engine error');
}
