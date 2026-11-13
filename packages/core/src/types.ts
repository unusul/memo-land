/** ISO-8601 UTC instant, e.g. "2026-11-03T08:00:00Z". */
export type Instant = string;
/** Floating local date, "YYYY-MM-DD", read in the group's time zone. */
export type LocalDate = string;
/** Floating local date-time, "YYYY-MM-DDTHH:mm", read in the group's time zone. */
export type LocalDateTime = string;

export type AccountId = string;
export type GroupId = string;
export type ActivityId = string;

/** The original start (or due) of an occurrence. */
export type OccurrenceKey = LocalDateTime | LocalDate;

export type Unit = 'day' | 'week' | 'month' | 'year';

/** The days of a weekly rule, as RRULE writes them. */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';
/** «HH:mm», a time of day without a date. */
export type TimeOfDay = string;
/** A day's own time in a weekly series; without an end it keeps the schedule's duration. */
export type DayTime = { start: TimeOfDay; end?: TimeOfDay };

export type Repeat =
  /** `times`: a weekly series may give some of its days a time of their own; the others keep the schedule's. */
  | { mode: 'calendar'; rrule: string; times?: Partial<Record<Weekday, DayTime>> }
  | { mode: 'fromCompletion'; every: { unit: Unit; count: number } };

export type Assignment = { state: 'proposed' | 'accepted'; assignee: AccountId; assignedBy: AccountId };

/** `activityId`: the activity waited for; `condition` is then its title, and it comes true when that one is done. */
export type WaitingFor = { condition: string; activityId?: ActivityId; metAt?: Instant; metBy?: AccountId };

export interface Props {
  due?: LocalDate | LocalDateTime;
  schedule?: { start: LocalDateTime; end?: LocalDateTime };
  repeat?: Repeat;
  assignment?: Assignment;
  waitingFor?: WaitingFor;
  resumeAt?: LocalDate | LocalDateTime;
  parentId?: ActivityId;
  /** High or low; none set is normal, so the activities of before need nothing. */
  priority?: Priority;
}

export type Priority = 'high' | 'low';

export type PropKey = keyof Props;

export interface OccurrenceOverride {
  assignee: AccountId;
  takenBy: AccountId;
}

export type HistoryKind =
  | 'created' | 'propSet' | 'propRemoved' | 'assigned' | 'accepted' | 'rejected' | 'released'
  | 'claimed' | 'conditionMet' | 'completed' | 'occurrenceTaken' | 'unassignedOnLeave'
  | 'snoozed' | 'resumed' | 'archived' | 'reopened' | 'movedToGroup' | 'movedToDrafts' | 'decomposed' | 'textEdited';

export interface HistoryEntry {
  at: Instant;
  by: AccountId;
  kind: HistoryKind;
  detail?: Record<string, unknown>;
}

export interface AttachmentRef {
  id: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Checklist {
  items: ChecklistItem[];
  /** A fixed list keeps its items when a recurring activity is completed, only unticked; otherwise ticked items go. */
  fixed: boolean;
  /** Every text the list has seen, with how many times it was added: the suggestions while typing. */
  known: Record<string, number>;
  /** Last item number handed out, so item ids never repeat within the list. */
  seq: number;
}

export type Status = 'open' | 'done' | 'archived';

export interface Activity {
  id: ActivityId;
  accountId: AccountId;
  /** null means the activity is a draft, private to its account. */
  groupId: GroupId | null;
  title: string;
  body: string;
  attachments: AttachmentRef[];
  props: Props;
  status: Status;
  /** Last completion, used by fromCompletion recurrences. */
  lastCompletedAt?: LocalDate | LocalDateTime;
  overrides: Record<OccurrenceKey, OccurrenceOverride>;
  /** A list of things to tick inside the activity (shopping, packing). */
  checklist?: Checklist;
  history: HistoryEntry[];
  createdAt: Instant;
  updatedAt: Instant;
  version: number;
}

export type Shape =
  | 'draft' | 'idea' | 'waiting' | 'snoozed' | 'recurring' | 'event' | 'task' | 'archived' | 'done';

export type Role = 'owner' | 'member' | 'guest';
