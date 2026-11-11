import { nextDue } from './completion.js';
import { asDateTime, isDateOnly } from './dates.js';
import type { Group } from './groups.js';
import { occurrencesBetween } from './occurrences.js';
import type { Occurrence } from './occurrences.js';
import { shapeOf } from './shape.js';
import type { AccountId, Activity, GroupId, LocalDate, LocalDateTime, Shape } from './types.js';

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

/** Merges several groups (possibly from different engines and accounts) into one agenda. */
export function buildAgenda(sources: AgendaSource[], from: LocalDateTime, to: LocalDateTime): Agenda {
  const items: AgendaItem[] = [];
  const waiting: Activity[] = [];
  for (const { group, activities } of sources) {
    for (const a of activities) {
      const shape = shapeOf(a, group.id);
      if (shape === 'waiting') waiting.push(a);
      else if (!HIDDEN.has(shape)) items.push(...occurrencesBetween(a, from, to).map(o => toItem(o, a, group, shape)));
    }
  }
  return { days: groupByDay(items.sort(byStart)), waiting };
}

function toItem(o: Occurrence, a: Activity, group: Group, shape: Shape): AgendaItem {
  return { ...o, groupId: group.id, accountId: a.accountId, title: a.title, shape };
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
  /** Activities that need the account, each counted once even when both overdue and proposed. */
  count: number;
}

/**
 * What waits for the account: overdue tasks and proposals to answer. A calendar series is never overdue, its past
 * occurrences are events that went by; a series from completion is, once its next date has passed.
 */
export function needsAttention(sources: AgendaSource[], me: AccountId, today: LocalDate): Attention {
  const overdue: Overdue[] = [];
  const proposed: Attention['proposed'] = [];
  for (const { group, activities } of sources) {
    for (const a of activities) {
      const shape = shapeOf(a, group.id);
      // A blocked memo waits for its condition, not for the account.
      if (HIDDEN.has(shape) || shape === 'waiting') continue;
      const asg = a.props.assignment;
      if (asg?.state === 'proposed' && asg.assignee === me) proposed.push({ activity: a, groupId: group.id });
      const since = dueDateOf(a);
      if (since !== undefined && since < today && (asg === undefined || asg.assignee === me)) overdue.push({ activity: a, groupId: group.id, since });
    }
  }
  overdue.sort((x, y) => x.since.localeCompare(y.since));
  const count = new Set([...overdue, ...proposed].map(x => x.activity.id)).size;
  return { overdue, proposed, count };
}

function dueDateOf(a: Activity): LocalDate | undefined {
  if (a.props.repeat?.mode === 'calendar') return undefined;
  const due = a.props.repeat?.mode === 'fromCompletion' ? nextDue(a) : a.props.due;
  return due?.slice(0, 10);
}
