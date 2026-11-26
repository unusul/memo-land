import { fail } from './errors.js';
import { newActivity } from './shape.js';
import type { AccountId, Activity, ActivityId, GroupId, Instant } from './types.js';

/*
 * Labels (user's choices, 2026-11-26): each group has its list, kept by who edits the group, and an activity takes
 * labels from it. A label is one word in lower case («memo»). Every group has «memo» from the start, the ones made
 * before too, and may take it away. In the group's list an activity with a label is under its first label, in the
 * group's order. The list is a hidden activity of the group, as a list model: no engine or rule changes.
 */

/** What a group has before anybody changes its list. */
export const DEFAULT_LABELS: readonly string[] = ['memo'];

/** A label as typed, made one word in lower case: spaces go. Empty when nothing is left. */
export function labelOf(text: string): string {
  return text.trim().toLocaleLowerCase('it').replace(/\s+/g, '');
}

export const isLabelSet = (a: Activity): boolean => a.labelSet !== undefined;

/**
 * The group's labels: from its list activity (the oldest, should two have been made at once), or the default ones.
 */
export function groupLabels(sets: Activity[], groupId: GroupId): string[] {
  const own = sets.filter(a => a.groupId === groupId && a.labelSet && a.status === 'open')
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))[0];
  return own ? [...own.labelSet!.labels] : [...DEFAULT_LABELS];
}

/** The group's list activity to save with `labels`: the one there, changed, or a new one. */
export function withGroupLabels(sets: Activity[], groupId: GroupId, labels: string[], id: ActivityId, by: AccountId, now: Instant): Activity {
  const own = sets.filter(a => a.groupId === groupId && a.labelSet && a.status === 'open')
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))[0];
  if (own) return { ...own, labelSet: { labels }, updatedAt: now };
  return { ...newActivity({ id, accountId: by, title: 'Etichette', groupId }, now), labelSet: { labels } };
}

/** The list with one label more, at the end; a label already there, or empty, is refused. */
export function addLabel(labels: string[], text: string): string[] {
  const label = labelOf(text);
  if (label === '') fail('INVALID_INPUT', 'a label needs a word');
  if (labels.includes(label)) fail('INVALID_INPUT', `«${label}» is already there`);
  return [...labels, label];
}

/** An activity's label switched on or off; no history entry, as the list's ticks. */
export function toggleLabel(a: Activity, label: string, now: Instant): Activity {
  const had = a.labels ?? [];
  const labels = had.includes(label) ? had.filter(l => l !== label) : [...had, label];
  const { labels: _old, ...rest } = a;
  return { ...rest, ...(labels.length > 0 ? { labels } : {}), updatedAt: now };
}

/** The activity's labels the group still has, in the group's order. */
export function labelsIn(a: Activity, labels: readonly string[]): string[] {
  return labels.filter(l => a.labels?.includes(l));
}

/** The section of the group's list an activity goes under: its first label in the group's order, if any. */
export const sectionLabelOf = (a: Activity, labels: readonly string[]): string | undefined => labelsIn(a, labels)[0];
