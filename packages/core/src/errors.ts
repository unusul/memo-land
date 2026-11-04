export type DomainErrorCode =
  | 'REASON_REQUIRED' | 'FORBIDDEN' | 'INVALID_STATE' | 'NOT_FOUND' | 'VERSION_CONFLICT' | 'INVALID_INPUT';

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

/** The engine could not be reached (network down, server unreachable): callers may retry or work offline. */
export class EngineUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EngineUnavailableError';
  }
}

export function fail(code: DomainErrorCode, message: string): never {
  throw new DomainError(code, message);
}
