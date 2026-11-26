import { nextDue } from './completion.js';
import { asDateTime, isDateOnly } from './dates.js';
import type { Group } from './groups.js';
import { occurrencesBetween } from './occurrences.js';
import type { Occurrence } from './occurrences.js';
import { shapeOf } from './shape.js';
import type { AccountId, Activity, GroupId, LocalDate, LocalDateTime, OccurrenceKey, Shape } from './types.js';

export interface AgendaItem extends Occurrence {
  groupId: GroupId;
  accountId: AccountId;
  title: string;
  shape: Shape;
}

export interface AgendaSource {
  group: Group;
  activities: Activity[];
}

export interface Agenda {
  days: Record<LocalDate, AgendaItem[]>;
  waiting: Activity[];
}

const HIDDEN: ReadonlySet<Shape> = new Set<Shape>(['archived', 'done', 'snoozed', 'draft']);
/**
 * Out of the days: a done activity stays on its day, struck through, as a done time of a series does (user's choice,
 * 2026-11-18; before, it left the Agenda and the Calendar once done).
 */
const OFF_DAYS: ReadonlySet<Shape> = new Set<Shape>(['archived', 'snoozed', 'draft']);

/**
 * Merges several groups (possibly from different engines and accounts) into one agenda. With `today`, an open activity
 * with a counter is one row on today, whatever its dates (user's choice, 2026-11-25: a count is kept every day, with no
 * repeat to set), and nowhere else.
 */
export function buildAgenda(sources: AgendaSource[], from: LocalDateTime, to: LocalDateTime, today?: LocalDate): Agenda {
  const items: AgendaItem[] = [];
  const waiting: Activity[] = [];
  for (const { group, activities } of sources) {
    for (const a of activities) {
      const shape = shapeOf(a, group.id);
      if (shape === 'waiting') waiting.push(a);
      else if (a.counter && today !== undefined) {
        if (a.status === 'open' && !OFF_DAYS.has(shape) && from.slice(0, 10) <= today && today <= to.slice(0, 10)) items.push(toItem({ activityId: a.id, key: today, start: today }, a, group, shape));
      }
      else if (!OFF_DAYS.has(shape)) items.push(...occurrencesBetween(a, from, to).map(o => toItem(o, a, group, shape)));
    }
  }
  return { days: groupByDay(items.sort(byStart)), waiting };
}

function toItem(o: Occurrence, a: Activity, group: Group, shape: Shape): AgendaItem {
  // A one-off activity done has no time of its own marked done: the whole of it is.
  const done = shape === 'done' && a.props.repeat === undefined ? { done: true as const } : {};
  return { ...o, ...done, groupId: group.id, accountId: a.accountId, title: a.title, shape };
}

/** Date-only items sort before timed items of the same day. */
function byStart(x: AgendaItem, y: AgendaItem): number {
  const dayCmp = x.start.slice(0, 10).localeCompare(y.start.slice(0, 10));
  if (dayCmp !== 0) return dayCmp;
  const allDay = Number(!isDateOnly(x.start)) - Number(!isDateOnly(y.start));
  return allDay !== 0 ? allDay : asDateTime(x.start).localeCompare(asDateTime(y.start));
}

function groupByDay(items: AgendaItem[]): Record<LocalDate, AgendaItem[]> {
  const days: Record<LocalDate, AgendaItem[]> = {};
  for (const item of items) (days[item.start.slice(0, 10)] ??= []).push(item);
  return days;
}

export interface Overdue {
  activity: Activity;
  groupId: GroupId;
  /** The date it was due. */
  since: LocalDate;
}

export interface Attention {
  /** Past their date, open, and either free or the account's own; oldest first. */
  overdue: Overdue[];
  /** Assignments proposed to the account, waiting for accept or reject. */
  proposed: Array<{ activity: Activity; groupId: GroupId }>;
  /**
   * «Copri tu questa» (2026-11-26): times of a series someone asked the account to cover, not answered, from today on;
   * nearest first.
   */
  coverAsks: CoverAskRow[];
  /** Activities that need the account, each counted once even when both overdue and proposed, plus each request to cover. */
  count: number;
}

export interface CoverAskRow { activity: Activity; groupId: GroupId; key: OccurrenceKey; by: AccountId }

/**
 * What waits for the account: overdue tasks and proposals to answer. A calendar series is never overdue, its past
 * occurrences are events that went by; a series from completion is, once its next date has passed.
 */
export function needsAttention(sources: AgendaSource[], me: AccountId, today: LocalDate): Attention {
  const overdue: Overdue[] = [];
  const proposed: Attention['proposed'] = [];
  const coverAsks: CoverAskRow[] = [];
  for (const { group, activities } of sources) {
    for (const a of activities) {
      const shape = shapeOf(a, group.id);
      // A blocked memo waits for its condition, not for the account.
      if (HIDDEN.has(shape) || shape === 'waiting') continue;
      const asg = a.props.assignment;
      if (asg?.state === 'proposed' && asg.assignee === me) proposed.push({ activity: a, groupId: group.id });
      for (const [key, o] of Object.entries(a.overrides)) {
        if (o.asked?.to === me && !o.asked.refused && key.slice(0, 10) >= today) coverAsks.push({ activity: a, groupId: group.id, key, by: o.asked.by });
      }
      const since = dueDateOf(a, today);
      if (since !== undefined && since < today && (asg === undefined || asg.assignee === me)) overdue.push({ activity: a, groupId: group.id, since });
    }
  }
  overdue.sort((x, y) => x.since.localeCompare(y.since));
  coverAsks.sort((x, y) => x.key.localeCompare(y.key));
  const count = new Set([...overdue, ...proposed].map(x => x.activity.id)).size + coverAsks.length;
  return { overdue, proposed, coverAsks, count };
}

function dueDateOf(a: Activity, today: LocalDate): LocalDate | undefined {
  if (a.props.repeat?.mode === 'calendar') return undefined;
  // A due date on days chosen (2026-11-17): the first of them gone by and not done is overdue, as a single due date.
  if (a.props.repeat?.mode === 'dates') {
    if (a.props.due === undefined) return undefined;
    const missed = occurrencesBetween(a, `${a.props.due.slice(0, 10)}T00:00`, `${today}T00:00`).find(o => !o.done && !o.skipped && o.movedTo === undefined && o.start.slice(0, 10) < today);
    return missed?.start.slice(0, 10);
  }
  const due = a.props.repeat?.mode === 'fromCompletion' ? nextDue(a) : a.props.due;
  return due?.slice(0, 10);
}
