import { newActivity } from '@attivita/core';
import { CLIP_DAYS, clipsOf, removeClip, useBarPrefs } from '../groups/barPrefs.js';
import type { Clip } from '../groups/barPrefs.js';
import { dayParts, instantNow, newId, today } from '../dates.js';
import { enqueueDraft, flushOutbox } from '../offline/outbox.js';
import { useSession } from '../session/SessionContext.js';
import { SwipeRow } from '../shell/SwipeRow.js';
import { useToast } from '../shell/toast.js';
import { useWs } from '../workspace/useWorkspace.js';
import { noteLastClip } from './device.js';
import { Icon } from '../shell/icons.js';

const DAY_MS = 86_400_000;
const localDay = (at: string) => { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hhmm = (at: string) => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/** «oggi 10:42», «ieri 18:03», «lun 16 nov 09:15». */
function whenSaved(at: string): string {
  const day = localDay(at);
  const yesterday = localDay(new Date(Date.now() - DAY_MS).toISOString());
  if (day === today()) return `oggi ${hhmm(at)}`;
  if (day === yesterday) return `ieri ${hhmm(at)}`;
  const p = dayParts(day);
  return `${p.weekday.slice(0, 3)} ${p.day} ${p.month} ${hhmm(at)}`;
}

/** The first link in a clip, to open it at once (user's choice, 2026-11-18). */
export const firstLink = (text: string): string | undefined => text.match(/https?:\/\/[^\s<>"]+/)?.[0];

/** A clip that is only a link reads as its site and path, «esempio.it/ricetta», without https:// and the query. */
export function clipTitle(text: string): string {
  const t = text.trim();
  if (firstLink(t) !== t) return text;
  try { const u = new URL(t); return `${u.host.replace(/^www\./, '')}${u.pathname === '/' ? '' : u.pathname}`; } catch { return text; }
}

/** «sparisce domani», «sparisce tra 2 giorni», when few days are left (user's choice, 2026-11-17). */
function goesIn(at: string, now = Date.now()): string | null {
  const left = Math.ceil((Date.parse(at) + CLIP_DAYS * DAY_MS - now) / DAY_MS);
  if (left > 2) return null;
  return left <= 1 ? 'sparisce domani' : `sparisce tra ${left} giorni`;
}

/**
 * «Appunti» in Io, above the drafts (user's choices, 2026-11-17): what was copied and kept, the newest first, with
 * when and from where. A tap copies it on this device; swiping left takes it away, swiping right makes it a draft to
 * sort, and then it stays. Each goes by itself after 7 days.
 */
export function ClipsSection() {
  const { account, primary: engine, outbox } = useSession();
  const ws = useWs();
  const toast = useToast();
  useBarPrefs();
  const clips = clipsOf(account);
  if (clips.length === 0) return null;

  async function copy(c: Clip) {
    try {
      await navigator.clipboard.writeText(c.text);
      noteLastClip(c.text);
      toast({ text: 'Copiato' });
    } catch {
      toast({ text: 'Non sono riuscito a copiare' });
    }
  }
  async function toDraft(c: Clip) {
    const [first = '', ...rest] = c.text.trim().split('\n');
    const draft = newActivity({ id: newId(), accountId: account, title: first.trim() || 'Bozza', body: rest.join('\n').trim() }, instantNow());
    try {
      await enqueueDraft(outbox, account, draft, [], instantNow());
      removeClip(account, c.id);
      toast({ text: 'Diventato una bozza' });
      if (navigator.onLine) await flushOutbox(outbox, engine).then(() => ws.reload()).catch(() => undefined);
    } catch {
      toast({ text: 'Non sono riuscito a farne una bozza: riprova.' });
    }
  }

  return (
    <div className="attention clips">
      <h3>Appunti</h3>
      <ul className="items" aria-label="Appunti">
        {clips.map(c => (
          <li key={c.id}>
            <SwipeRow left={{ label: 'Togli', icon: 'close', tone: 'remove', run: () => removeClip(account, c.id) }}
              right={{ label: 'Bozza', icon: 'edit', tone: 'go', run: () => void toDraft(c) }}>
              <div className="item-row">
                <button type="button" className="item" style={{ '--grp': 'var(--muted)' } as React.CSSProperties} aria-label={`Copia ${c.text.slice(0, 40)}`} onClick={() => void copy(c)}>
                  <span className="bar" /><span><span className="t clip-t">{clipTitle(c.text)}</span>
                    <span className="meta">{[whenSaved(c.at), c.from, goesIn(c.at)].filter(Boolean).join(' · ')}</span></span>
                </button>
                {/* A link opens at once, in the browser (user's choice, 2026-11-18); the tap on the row still copies. */}
                {firstLink(c.text) && <a className="icon-choice small clip-open" href={firstLink(c.text)} target="_blank" rel="noreferrer" aria-label="Apri il link" title="Apri il link"><Icon name="external" size={17} /></a>}
              </div>
            </SwipeRow>
          </li>
        ))}
      </ul>
    </div>
  );
}
