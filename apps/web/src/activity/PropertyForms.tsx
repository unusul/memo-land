import { useState } from 'react';
import { assign, moveToGroup, roleIn, setProp } from '@attivita/core';
import type { AccountId, Activity, Group, GroupId, Instant, PropKey, Repeat } from '@attivita/core';
import { today } from '../dates.js';
import { shortName } from '../labels.js';

export type Chip = PropKey | 'groupId';

const REPEATS: Array<[string, string, Repeat]> = [
  ['weekly-tt', 'martedì e giovedì', { mode: 'calendar', rrule: 'FREQ=WEEKLY;BYDAY=TU,TH' }],
  ['weekly', 'ogni settimana, stesso giorno', { mode: 'calendar', rrule: 'FREQ=WEEKLY' }],
  ['monthly-1-15', 'il 1° e il 15 del mese', { mode: 'calendar', rrule: 'FREQ=MONTHLY;BYMONTHDAY=1,15' }],
  ['monthly', 'ogni mese, stesso giorno', { mode: 'calendar', rrule: 'FREQ=MONTHLY' }],
  ['from-completion', 'ogni mese da quando la completi', { mode: 'fromCompletion', every: { unit: 'month', count: 1 } }],
];

export interface PropertyFormProps {
  chip: Chip;
  activity: Activity;
  group: Group | null;
  groups: Group[];
  me: AccountId;
  personalGroupId: GroupId;
  now: Instant;
  onApply(next: Activity): void;
}

/** One small form per property; each turns the input into a core operation. */
export function PropertyForm({ chip, activity: a, group, groups, me, personalGroupId, now, onApply }: PropertyFormProps) {
  const [value, setValue] = useState(() => initial(chip, personalGroupId, group));
  const role = group ? roleIn(group, me) ?? 'guest' : 'owner';

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
      {chip === 'repeat' && (
        <select aria-label="Ripeti" value={value} onChange={e => setValue(e.target.value)}>
          {REPEATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      )}
      {chip === 'assignment' && (group ? (
        <select aria-label="Assegna a" value={value} onChange={e => setValue(e.target.value)}>
          {Object.keys(group.members).map(m => <option key={m} value={m}>{m === me ? 'me' : shortName(m)}</option>)}
        </select>
      ) : <span className="muted">Prima mettila in un gruppo.</span>)}
      {chip === 'waitingFor' && <input aria-label="Condizione" placeholder="es. chiusura della ops 412" required value={value} onChange={e => setValue(e.target.value)} />}
      <button className="btn primary" type="submit" disabled={chip === 'assignment' && !group}>Aggiungi</button>
    </form>
  );
}

function initial(chip: Chip, personalGroupId: GroupId, group: Group | null): string {
  if (chip === 'groupId') return personalGroupId;
  if (chip === 'due') return today();
  if (chip === 'schedule') return `${today()}T09:00`;
  if (chip === 'repeat') return REPEATS[0]![0];
  if (chip === 'assignment') return Object.keys(group?.members ?? {})[0] ?? '';
  return '';
}

function build(chip: Chip, a: Activity, value: string, role: ReturnType<typeof roleIn> & string, me: AccountId, now: Instant): Activity {
  switch (chip) {
    case 'groupId': return moveToGroup(a, value, me, now);
    case 'due': return setProp(a, 'due', value, me, now);
    case 'schedule': return setProp(a, 'schedule', { start: value }, me, now);
    case 'repeat': {
      const repeat = REPEATS.find(([id]) => id === value)![2];
      const anchored = a.props.due || a.props.schedule ? a : setProp(a, 'due', today(), me, now);
      return setProp(anchored, 'repeat', repeat, me, now);
    }
    case 'assignment': return assign(a, value, me, role, now);
    case 'waitingFor': return setProp(a, 'waitingFor', { condition: value.trim() }, me, now);
    default: return a;
  }
}
