/** Engine limits live in configuration so they can follow provider changes without code edits. */
export interface EngineLimits {
  schedulerIntervalMinutes: number;
  refreshIntervalSeconds: number;
  maxAttachmentBytes: number;
  imageMaxEdgePx: number;
  imageJpegQuality: number;
  dailyEmailQuota: number;
  dailyExternalCallQuota: number;
}

export type EngineKind = 'google' | 'central' | 'memory';

const CENTRAL: EngineLimits = {
  schedulerIntervalMinutes: 1,
  refreshIntervalSeconds: 15,
  maxAttachmentBytes: 10_000_000,
  imageMaxEdgePx: 1600,
  imageJpegQuality: 0.8,
  dailyEmailQuota: 100,
  dailyExternalCallQuota: 100_000,
};

export const DEFAULT_LIMITS: Readonly<Record<EngineKind, Readonly<EngineLimits>>> = {
  google: { ...CENTRAL, schedulerIntervalMinutes: 10, refreshIntervalSeconds: 60, dailyExternalCallQuota: 20_000 },
  central: CENTRAL,
  memory: CENTRAL,
};

export function resolveLimits(kind: EngineKind, overrides: Partial<EngineLimits> = {}): EngineLimits {
  return { ...DEFAULT_LIMITS[kind], ...overrides };
}
