import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons.js';

/** Every half hour of a day, «00:00» to «23:30». */
const HALF_HOURS: readonly string[] = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const LIST_HEIGHT = 240;

const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const clock = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * A time as written by hand (user's choice, 2026-11-20, after Tempo's field): «9», «930», «9.30», «9,30», «9h30»,
 * «21:15» become «09:00», «09:30», «21:15»; anything else is null.
 */
export function parseTime(text: string): string | null {
  const m = text.trim().replace(/[.,h ]/g, ':').match(/^(\d{1,2})(?::?(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  return h > 23 || min > 59 ? null : clock(h * 60 + min);
}

/** The half hour nearest to `time`, where the list opens: on 08:45, 09:00 (ties go to the earlier one). */
export function nearestHalfHour(time: string): string {
  const at = minutesOf(parseTime(time) ?? '09:00');
  return HALF_HOURS.reduce((best, t) => (Math.abs(minutesOf(t) - at) < Math.abs(minutesOf(best) - at) ? t : best));
}

/**
 * A time written or chosen from a list of half hours opening on the time set (user's choice, 2026-11-20, after Tempo's
 * field), in place of the browser's time field, which every phone draws its own way. A full «HH:MM» goes out at once;
 * a short form («930») when the field is left or with Enter. What is not a time goes back to the time set; empty, to
 * empty only with `allowEmpty`. The list floats over the page, as the other menus (a list inside a panel made it longer).
 */
export function TimeField({ label, value, onChange, disabled = false, allowEmpty = false, after }: {
  label: string; value: string; onChange(time: string): void; disabled?: boolean; allowEmpty?: boolean;
  /** Only times later than this one (an end after its start, user's request 2026-11-20): an earlier one goes back. */
  after?: string | undefined;
}) {
  const [text, setText] = useState(value);
  const [at, setAt] = useState<React.CSSProperties | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => setText(value), [value]);
  const close = () => setAt(null);
  const open = () => {
    const box = input.current?.getBoundingClientRect();
    if (!box) return;
    const up = window.innerHeight - box.bottom < LIST_HEIGHT + 8 && box.top > LIST_HEIGHT + 8;
    setAt({ position: 'fixed', zIndex: 40, left: box.left, right: 'auto', minWidth: box.width,
      ...(up ? { top: 'auto', bottom: window.innerHeight - box.top + 4 } : { top: box.bottom + 4, bottom: 'auto' }) });
  };
  const commit = (raw: string) => {
    const t = parseTime(raw);
    if (t && (after === undefined || t > after)) { setText(t); if (t !== value) onChange(t); return; }
    if (raw.trim() === '' && allowEmpty) { setText(''); if (value !== '') onChange(''); return; }
    setText(value);
  };
  const pick = (t: string) => { commit(t); close(); };
  useEffect(() => {
    if (!at) return;
    // It opens on the half hour nearest the time set, in the middle of the list.
    const on = list.current?.querySelector<HTMLElement>('[data-near="true"]');
    if (list.current && on) list.current.scrollTop = on.offsetTop - (list.current.clientHeight - on.offsetHeight) / 2;
    // It stays where the field was: the panel scrolling or the window changing size closes it.
    const scroller = input.current?.closest('.menu.panel, .content');
    scroller?.addEventListener('scroll', close);
    window.addEventListener('resize', close);
    return () => { scroller?.removeEventListener('scroll', close); window.removeEventListener('resize', close); };
  }, [at !== null]);
  // Empty, an end opens just after its start rather than on 09:00, which may be before it.
  const near = nearestHalfHour(text || value || (after ? HALF_HOURS.find(t => t > after) ?? after : ''));
  return (
    <span className="time-field">
      <input ref={input} type="text" inputMode="numeric" autoComplete="off" aria-label={label} disabled={disabled} value={text}
        role="combobox" aria-expanded={at !== null} aria-autocomplete="none"
        onFocus={e => { e.target.select(); open(); }}
        onClick={() => { if (!at) open(); }}
        onBlur={() => { close(); commit(text); }}
        onChange={e => { setText(e.target.value); if (/^\d{2}:\d{2}$/.test(e.target.value) && parseTime(e.target.value)) commit(e.target.value); else if (e.target.value === '' && allowEmpty) commit(''); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(text); close(); }
          if (e.key === 'Escape' && at) { e.stopPropagation(); close(); }
        }} />
      {/* The ▾ says that a tap opens the half hours (user's remark, 2026-11-20). */}
      <span className="time-caret" aria-hidden="true"><Icon name="chevron" size={16} /></span>
      {at && createPortal(
        <span className="attach floated">
          <ul ref={list} role="listbox" aria-label={label} className="menu hours time-list" style={at}>
            {HALF_HOURS.filter(t => after === undefined || t > after).map(t => (
              <li key={t} role="option" aria-selected={t === value} data-near={t === near}
                onPointerDown={e => { e.preventDefault(); pick(t); }} onClick={() => pick(t)}>{t.replace(/^0(\d)/, '$1')}</li>
            ))}
          </ul>
        </span>, document.body)}
    </span>
  );
}
