import { useEffect, useState } from 'react';
import type { Activity } from '@attivita/core';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

export function DraftsView({ onOpen }: { onOpen(t: OpenTarget): void }) {
  const { account, outbox } = useSession();
  const ws = useWs();
  const [queued, setQueued] = useState<Activity[]>([]);

  // Drafts still in the outbox are shown too, so a capture made offline never looks lost.
  useEffect(() => {
    outbox.list(account).then(l => setQueued(l.map(e => e.activity))).catch(() => setQueued([]));
  }, [account, outbox, ws.drafts]);

  const sent = new Set(ws.drafts.map(d => d.id));
  const waiting = queued.filter(q => !sent.has(q.id));
  const drafts = ws.drafts.filter(d => d.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section aria-labelledby="drafts-h" className="stack">
      <h2 id="drafts-h">Bozze</h2>
      <p className="muted">Le vedi solo tu. Aprine una per smistarla: spostala in un gruppo, scomponila o rimandala.</p>
      {drafts.length === 0 && waiting.length === 0 ? <p className="muted">Nessuna bozza da smistare. Premi + per catturare un'idea.</p> : (
        <ul className="items">
          {waiting.map(d => (
            <li key={d.id}>
              <div className="item" style={{ '--grp': 'var(--warn)' } as React.CSSProperties}>
                <span className="bar" /><span><span className="t">{d.title}</span><br /><span className="pill cover">in attesa di rete</span></span>
                <span className="time">{d.createdAt.slice(5, 10).split('-').reverse().join('/')}</span>
              </div>
            </li>
          ))}
          {drafts.map(d => (
            <li key={d.id}>
              <button className="item" style={{ '--grp': 'var(--muted)' } as React.CSSProperties} onClick={() => onOpen({ activityId: d.id })}>
                <span className="bar" /><span><span className="t">{d.title}</span>{d.attachments.length > 0 && <><br /><span className="meta">{d.attachments.length} allegati</span></>}</span>
                <span className="time">{d.createdAt.slice(5, 10).split('-').reverse().join('/')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
