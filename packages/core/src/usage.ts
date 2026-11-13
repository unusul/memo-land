import type { PropKey } from './types.js';

export type UsageStats = Partial<Record<PropKey, number>>;

export const DEFAULT_PROP_ORDER: readonly PropKey[] = ['due', 'schedule', 'repeat', 'assignment', 'waitingFor', 'resumeAt', 'parentId', 'priority'];

export function recordUse(stats: UsageStats, key: PropKey): UsageStats {
  return { ...stats, [key]: (stats[key] ?? 0) + 1 };
}

/** Most used first; ties keep the default order (Array.prototype.sort is stable). */
export function rankProps(stats: UsageStats, all: readonly PropKey[] = DEFAULT_PROP_ORDER): PropKey[] {
  return [...all].sort((a, b) => (stats[b] ?? 0) - (stats[a] ?? 0));
}
