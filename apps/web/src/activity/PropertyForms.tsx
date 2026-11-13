import { useEffect, useState } from 'react';
import { assign, groupTypeOf, moveBetweenGroups, moveToGroup, roleIn, setProp } from '@attivita/core';
import type { AccountId, Activity, ActivityId, Group, GroupId, Instant, LocalDateTime, Priority, PropKey } from '@attivita/core';
import { today } from '../dates.js';
import { shortName } from '../labels.js';
import { DatePicker, DateTimePicker, DurationRow, minutesBetween, plusMinutes } from './DatePicker.js';
import { RepeatForm } from './RepeatForm.js';
import { WaitedActivity } from './WaitedActivity.js';

export type Chip = PropKey | 'groupId';

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
  // Where it can go: not where it is, not where the person is a guest, not into a list group (it would not be seen).
  const targets = groups.filter(g => g.id !== a.groupId && roleIn(g, me) !== 'guest' && groupTypeOf(g) !== 'list');
  const [value, setValue] = useState(() => current(chip, a) ?? (chip === 'groupId' && a.groupId !== null ? targets[0]?.id ?? '' : initial(chip, personalGroupId, group)));
  const editing = current(chip, a) !== undefined;
  const role = group ? roleIn(group, me) ?? 'guest' : 'owner';
  // The schedule's end, when it has one: the optional duration under the time.
  const [end, setEnd] = useState<LocalDateTime | ''>(() => (chip === 'schedule' ? a.props.schedule?.end ?? '' : ''));
  // The activity waited for, when «In attesa di» names one instead of a free sentence.
  const [linked, setLinked] = useState<ActivityId | ''>(() => (chip === 'waitingFor' ? a.props.waitingFor?.activityId ?? '' : ''));
  const [start] = useState(value);
  const [opened] = useState({ end, linked });
  const valid = value.trim() !== '' && !(chip === 'assignment' && !group);
  const extra = { end, linked };
  useEffect(() => {
    const changed = value !== start || end !== opened.end || linked !== opened.linked;
    if (chip !== 'repeat') onPending?.(changed && valid ? () => build(chip, a, value, role, me, now, extra) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, end, linked]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => onPending?.(null), []);

  if (chip === 'repeat') return <RepeatForm activity={a} me={me} now={now} onApply={onApply} onPending={onPending} />;

  function apply(e: React.FormEvent) {
    e.preventDefault();
    onApply(build(chip, a, value, role, me, now, extra));
  }

  return (
    <form className="form" onSubmit={apply}>
      {chip === 'groupId' && (
        <select aria-label="Gruppo" value={value} onChange={e => setValue(e.target.value)}>
          {targets.map(g => <option key={g.id} value={g.id}>{g.kind === 'personal' ? 'Idee personali' : g.name}</option>)}
        </select>
      )}
      {chip === 'due' && <DatePicker label="Scadenza" value={value} onChange={setValue} />}
      {chip === 'schedule' && <>
        {/* A new start keeps the event's duration: the end moves with it. */}
        <DateTimePicker label="Data e ora" value={value} onChange={v => { if (end && value) setEnd(plusMinutes(v, minutesBetween(value, end))); setValue(v); }} />
        <DurationRow start={value} end={end} onChange={setEnd} />
      </>}
      {chip === 'assignment' && (group ? (
        <select aria-label="Assegna a" value={value} onChange={e => setValue(e.target.value)}>
          {Object.keys(group.members).map(m => <option key={m} value={m}>{m === me ? 'me' : shortName(m)}</option>)}
        </select>
      ) : <span className="muted">Prima mettila in un gruppo.</span>)}
      {chip === 'priority' && (
        <select aria-label="Priorità" value={value} onChange={e => setValue(e.target.value)}>
          <option value="high">Alta</option>
          <option value="low">Bassa</option>
        </select>
      )}
      {chip === 'waitingFor' && <>
        {/* A sentence of one's own, or an activity: then the sentence is its title, and typing over it lets it go. */}
        <input aria-label="Condizione" placeholder="es. chiusura della ops 412" required value={value} onChange={e => { setValue(e.target.value); setLinked(''); }} />
        <WaitedActivity self={a} linked={linked} text={value} onLink={(id, title) => { setLinked(id); if (id) setValue(title); }} />
      </>}
      <button className="btn primary" type="submit" disabled={chip === 'assignment' && !group}>{chip === 'groupId' && a.groupId !== null ? 'Sposta' : editing ? 'Salva' : 'Aggiungi'}</button>
    </form>
  );
}

/** The value already set, when the form edits a property instead of adding it. */
function current(chip: Chip, a: Activity): string | undefined {
  if (chip === 'due') return a.props.due;
  if (chip === 'schedule') return a.props.schedule?.start;
  if (chip === 'waitingFor') return a.props.waitingFor?.condition;
  if (chip === 'assignment') return a.props.assignment?.assignee;
  if (chip === 'priority') return a.props.priority;
  return undefined;
}

function initial(chip: Chip, personalGroupId: GroupId, group: Group | null): string {
  if (chip === 'groupId') return personalGroupId;
  if (chip === 'due') return today();
  if (chip === 'schedule') return `${today()}T09:00`;
  if (chip === 'assignment') return Object.keys(group?.members ?? {})[0] ?? '';
  // Normal is no priority: a new one is high, the reason to set one at all.
  if (chip === 'priority') return 'high';
  return '';
}

interface Extra { end: LocalDateTime | ''; linked: ActivityId | '' }

function build(chip: Chip, a: Activity, value: string, role: ReturnType<typeof roleIn> & string, me: AccountId, now: Instant, { end, linked }: Extra): Activity {
  switch (chip) {
    case 'groupId': return a.groupId === null ? moveToGroup(a, value, me, now) : moveBetweenGroups(a, value, me, now);
    case 'due': return setProp(a, 'due', value, me, now);
    case 'schedule': return setProp(a, 'schedule', end ? { start: value, end } : { start: value }, me, now);
    case 'assignment': return assign(a, value, me, role, now);
    case 'waitingFor': {
      const { activityId: _was, ...kept } = a.props.waitingFor ?? { condition: '' };
      return setProp(a, 'waitingFor', { ...kept, condition: value.trim(), ...(linked ? { activityId: linked } : {}) }, me, now);
    }
    case 'priority': return setProp(a, 'priority', value as Priority, me, now);
    default: return a;
  }
}

