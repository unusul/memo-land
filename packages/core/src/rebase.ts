import type { Activity } from './types.js';

const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);

/** `theirs` with what `mine` changed from `base`, key by key: a key `mine` took away is taken away. */
function merged<T extends object>(base: T, mine: T, theirs: T): T {
  const out: Record<string, unknown> = { ...(theirs as Record<string, unknown>) };
  const b = base as Record<string, unknown>, m = mine as Record<string, unknown>;
  for (const k of new Set([...Object.keys(b), ...Object.keys(m)])) {
    if (same(b[k], m[k])) continue;
    if (k in m) out[k] = m[k]; else delete out[k];
  }
  return out as T;
}

/**
 * A change computed on `base`, put again on `theirs`: a newer version of the same activity the same person has just
 * saved (user's bug, 2026-11-17: the text saved on leaving the field, then Archivia tapped at once, made a false
 * «Qualcun altro l'ha appena modificata» and the archive was lost). Field by field, and the properties one by one, what
 * `mine` changed wins and the rest is `theirs`; the history is theirs, then the entries `mine` added. Only for the same
 * person's own saves in a row: a change made by someone else stays a conflict.
 */
export function rebase(base: Activity, mine: Activity, theirs: Activity): Activity {
  const { history: _h, props: _p, version: _v, ...fields } = merged(base, mine, theirs);
  return {
    ...fields,
    props: merged(base.props, mine.props, theirs.props),
    history: [...theirs.history, ...mine.history.slice(base.history.length)],
    updatedAt: mine.updatedAt,
    version: theirs.version,
  } as Activity;
}
