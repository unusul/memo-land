import { useState } from 'react';
import { newActivity } from '@attivita/core';
import type { Activity, ActivityId } from '@attivita/core';
import { instantNow, newId } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

/**
 * «In attesa di» an activity instead of a sentence: one of the open activities the person sees, or a new one made from
 * the sentence typed, in the same group. The condition then comes true by itself when that activity is done.
 */
export function WaitedActivity({ self, linked, text, onLink }: {
  self: Activity; linked: ActivityId | ''; text: string; onLink(id: ActivityId | '', title: string): void;
}) {
  const ws = useWs();
  const { account } = useSession();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const seen = new Map([...ws.activities, ...ws.drafts].map(x => [x.id, x]));
  const choices = [...seen.values()].filter(x => x.id !== self.id && x.status === 'open').sort((x, y) => x.title.localeCompare(y.title, 'it'));

  async function create() {
    const title = text.trim();
    if (!title) return;
    setBusy(true);
    try {
      setProblem(null);
      const made = await ws.save(newActivity({ id: newId(), accountId: account, title, body: '', groupId: self.groupId }, instantNow()));
      onLink(made.id, made.title);
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="waited">
      <select aria-label="Scegli un'attività" value={linked} onChange={e => onLink(e.target.value, seen.get(e.target.value)?.title ?? '')}>
        <option value="">Scegli un'attività…</option>
        {choices.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
      </select>
      <button type="button" className="btn" disabled={busy || !text.trim() || linked !== ''} onClick={() => void create()}>Creane una nuova</button>
      {problem && <span className="error" role="alert">{problem}</span>}
    </span>
  );
}
