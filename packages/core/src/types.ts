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

/**
 * `times`: a weekly series may give some of its days a time of their own; the others keep the schedule's. `until`: the
 * last day of the series (user's choice, 2026-11-16, a date only): no time after it, and the last time done closes the
 * activity. Absent, the series goes on for ever, as before.
 * `dates` («a date scelte», user's choice, 2026-11-17): days chosen one by one besides the day of the date or schedule,
 * each at its time, in place of a rule; the last one done closes the activity, so it needs no `until`.
 */
export type Repeat =
  | { mode: 'calendar'; rrule: string; times?: Partial<Record<Weekday, DayTime>>; until?: LocalDate }
  | { mode: 'fromCompletion'; every: { unit: Unit; count: number }; until?: LocalDate }
  | { mode: 'dates'; dates: LocalDate[]; until?: undefined };

/**
 * `external`: the assignee is a name typed for someone outside the group (user's choice, 2026-11-16), not an account;
 * nobody can answer for them, so it is taken at once.
 */
export type Assignment = { state: 'proposed' | 'accepted'; assignee: AccountId; assignedBy: AccountId; external?: true };

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

/** What changes on one occurrence of a series, under its original key. */
export interface OccurrenceOverride {
  /** Set together with takenBy when someone covers the occurrence. */
  assignee?: AccountId;
  takenBy?: AccountId;
  /** The occurrence does not take place; it stays in the agenda, struck through. */
  skipped?: true;
  /** The new start (a day for a series of whole days); the duration stays the series'. */
  moved?: LocalDateTime | LocalDate;
}

export type HistoryKind =
  | 'created' | 'propSet' | 'propRemoved' | 'assigned' | 'accepted' | 'rejected' | 'released'
  | 'claimed' | 'conditionMet' | 'completed' | 'occurrenceTaken' | 'occurrenceLeft' | 'unassignedOnLeave'
  | 'occurrenceSkipped' | 'occurrenceMoved' | 'occurrenceRestored' | 'occurrenceReopened'
  | 'snoozed' | 'resumed' | 'archived' | 'reopened' | 'movedToGroup' | 'movedToDrafts' | 'decomposed' | 'textEdited'
  | 'attachmentRemoved';

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
  /**
   * Who takes this item: a member's account, or a name typed for someone outside the group (user's choice, 2026-11-16).
   * A hint for the others, nothing more (no agenda, no notice).
   */
  assignee?: string;
}

export interface Checklist {
  items: ChecklistItem[];
  /** A fixed list keeps its items when a recurring activity is completed, only unticked; otherwise ticked items go. */
  fixed: boolean;
  /** Items can go to one person each; off unless switched on (user's choice, 2026-11-16). */
  assignable?: boolean;
  /** Every text the list has seen, with how many times it was added: the suggestions while typing. */
  known: Record<string, number>;
  /** Last item number handed out, so item ids never repeat within the list. */
  seq: number;
  /** The model the list is sorted by: a model activity's id (user's choice, 2026-11-16). */
  model?: ActivityId;
}

export interface ModelSection {
  /** Stable across renames: the items point here, not to the name. */
  id: string;
  name: string;
}

/**
 * A list model (user's choices, 2026-11-16), kept as a hidden activity of the group it belongs to, so its members see
 * and change it: an icon, the sections in order (the departments of a supermarket, the genres of a game list) and the
 * items placed in them. A list using it is sorted section by section on request.
 */
export interface ListModel {
  /** One of the group icons' names. */
  icon: string;
  sections: ModelSection[];
  /**
   * An item's key (`itemKey`) → its name as written and its section id. `fresh`: written in a list and learnt in Altro,
   * not yet placed by anyone (user's choice, 2026-11-18).
   */
  items: Record<string, { name: string; section: string; fresh?: true }>;
  /** Last section number handed out, so the ids of added sections never repeat. */
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
  /** Set on a list model only: the activity is hidden everywhere and holds the model (see ListModel). */
  model?: ListModel;
  /**
   * «Si chiude da sola» (2026-11-16): marked done by itself at the end of its time; `since` is the local time it was
   * switched on, and only the times ending after it count.
   */
  closesItself?: { since: LocalDateTime };
  /** «Informazione utile» (2026-11-17): to know, not to do; out of the Calendar, reduced and grey in the Agenda. */
  info?: true;
  /** «Non mostrare in calendario» (2026-11-17): in the Agenda, not in the Calendar. */
  offCalendar?: true;
  history: HistoryEntry[];
  createdAt: Instant;
  updatedAt: Instant;
  version: number;
}

export type Shape =
  | 'draft' | 'idea' | 'waiting' | 'snoozed' | 'recurring' | 'event' | 'task' | 'archived' | 'done';

export type Role = 'owner' | 'member' | 'guest';
