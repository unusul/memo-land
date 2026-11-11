import { RRule } from 'rrule';
import { toFloating } from './dates.js';
import { fail } from './errors.js';
import { reconcileCovers } from './occurrences.js';
import type { AccountId, Activity, HistoryEntry, Instant, PropKey, Props } from './types.js';

/** Keys that only their dedicated operations may change. */
const DEDICATED_KEYS: ReadonlySet<PropKey> = new Set<PropKey>(['assignment', 'parentId']);
/** Keys that move occurrences, so covers keyed by the old starts must be reconciled. */
const TIMING_KEYS: ReadonlySet<PropKey> = new Set<PropKey>(['due', 'schedule', 'repeat']);

/** Appends a history entry and bumps updatedAt; the version is bumped only by the engine on save. */
export function touch(a: Activity, entry: Omit<HistoryEntry, 'at' | 'by'>, by: AccountId, now: Instant): Activity {
  return { ...a, history: [...a.history, { at: now, by, ...entry }], updatedAt: now };
}

export function withProps(a: Activity, props: Props): Activity {
  return { ...a, props };
}

export function setProp<K extends PropKey>(a: Activity, key: K, value: NonNullable<Props[K]>, by: AccountId, now: Instant): Activity {
  validateProps({ [key]: value });
  return changeProps(a, { ...a.props, [key]: structuredClone(value) }, key, { key, value }, by, now);
}

/** Changes title and/or text; returns the same activity when nothing changed, so callers can skip the save. */
export function editText(a: Activity, text: { title?: string; body?: string }, by: AccountId, now: Instant): Activity {
  const title = text.title === undefined ? a.title : text.title.trim();
  const body = text.body ?? a.body;
  if (title === '') fail('INVALID_INPUT', 'the title cannot be empty');
  const fields = [...(title !== a.title ? ['title'] : []), ...(body !== a.body ? ['body'] : [])];
  if (fields.length === 0) return a;
  return touch({ ...a, title, body }, { kind: 'textEdited', detail: { fields } }, by, now);
}

export function removeProp(a: Activity, key: PropKey, by: AccountId, now: Instant): Activity {
  const { [key]: _removed, ...rest } = a.props;
  return changeProps(a, rest, key, { key }, by, now);
}

function changeProps(a: Activity, props: Props, key: PropKey, detail: Record<string, unknown>, by: AccountId, now: Instant): Activity {
  const kind = 'value' in detail ? 'propSet' : 'propRemoved';
  const updated = withProps(a, props);
  if (!TIMING_KEYS.has(key)) return touch(updated, { kind, detail }, by, now);
  if (props.repeat && props.due === undefined && props.schedule === undefined) fail('INVALID_STATE', 'a repeating activity needs a date to start from');
  const { activity, dropped } = reconcileCovers(updated);
  return touch(activity, { kind, detail: dropped.length ? { ...detail, droppedCovers: dropped } : detail }, by, now);
}

/** Validates props coming from outside the dedicated operations (setter, decomposition). */
export function validateProps(props: Props): void {
  for (const key of Object.keys(props) as PropKey[]) {
    if (DEDICATED_KEYS.has(key)) fail('INVALID_INPUT', `property "${key}" has a dedicated operation`);
  }
  if (props.due !== undefined) toFloating(props.due);
  if (props.resumeAt !== undefined) toFloating(props.resumeAt);
  if (props.schedule) validateSchedule(props.schedule);
  if (props.repeat) validateRepeat(props.repeat);
}

function validateSchedule(s: NonNullable<Props['schedule']>): void {
  toFloating(s.start);
  if (s.end !== undefined && toFloating(s.end) < toFloating(s.start)) fail('INVALID_INPUT', 'schedule end is before start');
}

function validateRepeat(r: NonNullable<Props['repeat']>): void {
  if (r.mode === 'fromCompletion') {
    if (!(Number.isInteger(r.every.count) && r.every.count >= 1)) fail('INVALID_INPUT', 'repeat count must be a positive integer');
    return;
  }
  validateRrule(r.rrule);
}

function validateRrule(rrule: string): void {
  try {
    const options = RRule.parseString(rrule);
    if (typeof options.freq !== 'number') throw new Error('missing FREQ');
    new RRule(options).all((_d, i) => i < 1);
  } catch {
    fail('INVALID_INPUT', `invalid recurrence rule "${rrule}"`);
  }
}
