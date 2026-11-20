/**
 * A reader for the `.ics` files Google Calendar exports (user's choice, 2026-11-20: our own, no library): folded lines,
 * escaped text, dates with a zone (`TZID`), in UTC (`Z`), floating, or whole days. Only events are read; a reminder
 * inside one is only noted, since reminders are not imported.
 */

/** A time as the file writes it: «YYYY-MM-DD» for a whole day, else «YYYY-MM-DDTHH:mm» with its zone or UTC. */
export interface IcsTime {
  value: string;
  zone?: string;
  utc?: true;
}

export interface IcsEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  /** Google's video call link (`X-GOOGLE-CONFERENCE`). */
  conference: string;
  start?: IcsTime;
  end?: IcsTime;
  rrule?: string;
  exdates: IcsTime[];
  /** Set on a changed or cancelled time of a series: the time it replaces. */
  recurrenceId?: IcsTime;
  cancelled: boolean;
  hasAlarm: boolean;
}

interface IcsLine {
  name: string;
  params: Record<string, string>;
  value: string;
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  const stack: string[] = [];
  let current: IcsEvent | undefined;
  for (const line of unfold(text).map(parseLine)) {
    if (line.name === 'BEGIN') {
      stack.push(line.value.toUpperCase());
      if (stack.at(-1) === 'VEVENT') current = emptyEvent();
      if (stack.at(-1) === 'VALARM' && current) current.hasAlarm = true;
    } else if (line.name === 'END') {
      if (stack.pop() === 'VEVENT' && current) {
        events.push(current);
        current = undefined;
      }
    } else if (current && stack.at(-1) === 'VEVENT') {
      readProperty(current, line);
    }
  }
  return events;
}

function emptyEvent(): IcsEvent {
  return { uid: '', summary: '', description: '', location: '', conference: '', exdates: [], cancelled: false, hasAlarm: false };
}

/** Joins the lines folded with a leading space or tab, and drops the empty ones. */
function unfold(text: string): string[] {
  return text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).filter(l => l.trim() !== '');
}

function parseLine(raw: string): IcsLine {
  const colon = valueStart(raw);
  const [name = '', ...params] = splitOutsideQuotes(raw.slice(0, colon), ';');
  const entries = params.map(p => [p.slice(0, p.indexOf('=')).toUpperCase(), p.slice(p.indexOf('=') + 1).replace(/^"|"$/g, '')]);
  return { name: name.toUpperCase(), params: Object.fromEntries(entries), value: raw.slice(colon + 1) };
}

/** The colon that ends name and parameters: a parameter in quotes may hold one. */
function valueStart(raw: string): number {
  let quoted = false;
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '"') quoted = !quoted;
    else if (raw[i] === ':' && !quoted) return i;
  }
  return raw.length;
}

function splitOutsideQuotes(s: string, sep: string): string[] {
  const parts: string[] = [];
  let quoted = false;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"') quoted = !quoted;
    else if (s[i] === sep && !quoted) {
      parts.push(s.slice(from, i));
      from = i + 1;
    }
  }
  return [...parts, s.slice(from)];
}

function readProperty(e: IcsEvent, line: IcsLine): void {
  switch (line.name) {
    case 'UID': e.uid = line.value; break;
    case 'SUMMARY': e.summary = unescapeText(line.value); break;
    case 'DESCRIPTION': e.description = unescapeText(line.value); break;
    case 'LOCATION': e.location = unescapeText(line.value); break;
    case 'X-GOOGLE-CONFERENCE': e.conference = line.value; break;
    case 'DTSTART': e.start = parseTime(line.value, line.params); break;
    case 'DTEND': e.end = parseTime(line.value, line.params); break;
    case 'RRULE': e.rrule = line.value; break;
    case 'EXDATE': e.exdates.push(...line.value.split(',').map(v => parseTime(v, line.params))); break;
    case 'RECURRENCE-ID': e.recurrenceId = parseTime(line.value, line.params); break;
    case 'STATUS': e.cancelled = line.value.toUpperCase() === 'CANCELLED'; break;
  }
}

function unescapeText(v: string): string {
  return v.replace(/\\([nN,;\\])/g, (_m, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

/** «20261120», «20261120T090000», «20261120T090000Z»; seconds are dropped. */
export function parseTime(raw: string, params: Record<string, string> = {}): IcsTime {
  const v = raw.trim();
  const date = `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  if (v.length === 8 || params.VALUE === 'DATE') return { value: date };
  const value = `${date}T${v.slice(9, 11)}:${v.slice(11, 13)}`;
  if (v.endsWith('Z')) return { value, utc: true };
  return params.TZID ? { value, zone: params.TZID } : { value };
}
