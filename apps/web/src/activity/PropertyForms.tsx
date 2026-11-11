import { useEffect, useState } from 'react';
import { assign, fromFloating, moveToGroup, roleIn, setProp, toFloating } from '@attivita/core';
import type { AccountId, Activity, Group, GroupId, Instant, LocalDateTime, PropKey, Props } from '@attivita/core';
import { today } from '../dates.js';
import { shortName } from '../labels.js';
import { RepeatForm } from './RepeatForm.js';

export type Chip = PropKey | 'groupId';
type Schedule = NonNullable<Props['schedule']>;

export interface PropertyFormProps {
  chip: Chip;
  activity: Activity;
  group: Group | null;
  groups: Group[];
  me: AccountId;
  personalGroupId: GroupId;
  now: Instant;
  onApply(next: Activity): void;
  /** Told the change the form holds, or null when there is none to save: Chiudi saves it. */
  onPending?(build: (() => Activity) | null): void;
}

/** One small form per property; each turns the input into a core operation. */
export function PropertyForm({ chip, activity: a, group, groups, me, personalGroupId, now, onApply, onPending }: PropertyFormProps) {
  const [value, setValue] = useState(() => current(chip, a) ?? initial(chip, personalGroupId, group));
  const editing = current(chip, a) !== undefined;
  const role = group ? roleIn(group, me) ?? 'guest' : 'owner';
  const [start] = useState(value);
  const valid = value.trim() !== '' && !(chip === 'assignment' && !group);
  useEffect(() => {
    if (chip !== 'repeat') onPending?.(value !== start && valid ? () => build(chip, a, value, role, me, now) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPending?.(null), []);

  if (chip === 'repeat') return <RepeatForm activity={a} me={me} now={now} onApply={onApply} onPending={onPending} />;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    onApply(build(chip, a, value, role, me, now));
  }

  return (
    <form className="form" onSubmit={apply}>
      {chip === 'groupId' && (
        <select aria-label="Gruppo" value={value} onChange={e => setValue(e.target.value)}>
          {groups.map(g => <option key={g.id} value={g.id}>{g.kind === 'personal' ? 'Idee personali' : g.name}</option>)}
        </select>
      )}
      {chip === 'due' && <input aria-label="Scadenza" type="date" required value={value} onChange={e => setValue(e.target.value)} />}
      {chip === 'schedule' && <input aria-label="Data e ora" type="datetime-local" required value={value} onChange={e => setValue(e.target.value)} />}
      {chip === 'assignment' && (group ? (
        <select aria-label="Assegna a" value={value} onChange={e => setValue(e.target.value)}>
          {Object.keys(group.members).map(m => <option key={m} value={m}>{m === me ? 'me' : shortName(m)}</option>)}
        </select>
      ) : <span className="muted">Prima mettila in un gruppo.</span>)}
      {chip === 'waitingFor' && <input aria-label="Condizione" placeholder="es. chiusura della ops 412" required value={value} onChange={e => setValue(e.target.value)} />}
      <button className="btn primary" type="submit" disabled={chip === 'assignment' && !group}>{editing ? 'Salva' : 'Aggiungi'}</button>
    </form>
  );
}

/** The value already set, when the form edits a property instead of adding it. */
function current(chip: Chip, a: Activity): string | undefined {
  if (chip === 'due') return a.props.due;
  if (chip === 'schedule') return a.props.schedule?.start;
  if (chip === 'waitingFor') return a.props.waitingFor?.condition;
  return undefined;
}

function initial(chip: Chip, personalGroupId: GroupId, group: Group | null): string {
  if (chip === 'groupId') return personalGroupId;
  if (chip === 'due') return today();
  if (chip === 'schedule') return `${today()}T09:00`;
  if (chip === 'assignment') return Object.keys(group?.members ?? {})[0] ?? '';
  return '';
}

function build(chip: Chip, a: Activity, value: string, role: ReturnType<typeof roleIn> & string, me: AccountId, now: Instant): Activity {
  switch (chip) {
    case 'groupId': return moveToGroup(a, value, me, now);
    case 'due': return setProp(a, 'due', value, me, now);
    case 'schedule': return setProp(a, 'schedule', moved(a.props.schedule, value), me, now);
    case 'assignment': return assign(a, value, me, role, now);
    case 'waitingFor': return setProp(a, 'waitingFor', { ...a.props.waitingFor, condition: value.trim() }, me, now);
    default: return a;
  }
}

/** A new start keeps the event's duration. */
function moved(old: Schedule | undefined, start: LocalDateTime): Schedule {
  if (!old?.end) return { start };
  const minutes = (toFloating(old.end).getTime() - toFloating(old.start).getTime()) / 60_000;
  const end = toFloating(start);
  end.setUTCMinutes(end.getUTCMinutes() + minutes);
  return { start, end: fromFloating(end, false) };
}
