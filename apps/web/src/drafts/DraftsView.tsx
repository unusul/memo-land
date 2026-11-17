import { useEffect, useRef, useState } from 'react';
import { moveToGroup } from '@attivita/core';
import type { Activity, Group } from '@attivita/core';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { instantNow } from '../dates.js';
import { groupName } from '../groups/GroupsView.js';
import { moveTargets } from '../groups/moveTargets.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { MenuChoice } from '../shell/PopMenu.js';
import { SwipeRow } from '../shell/SwipeRow.js';
import { useToast } from '../shell/toast.js';
import { useWs } from '../workspace/useWorkspace.js';

export function DraftsView({ onOpen }: { onOpen(t: OpenTarget): void }) {
  const { account, outbox } = useSession();
  const ws = useWs();
  const [queued, setQueued] = useState<Activity[]>([]);
  // The draft whose menu of groups is open, after the swipe: one at a time.
  const [moving, setMoving] = useState<string | null>(null);

  // Drafts still in the outbox are shown too, so a capture made offline never looks lost.
  useEffect(() => {
    outbox.list(account).then(l => setQueued(l.map(e => e.activity))).catch(() => setQueued([]));
  }, [account, outbox, ws.drafts]);

  const sent = new Set(ws.drafts.map(d => d.id));
  const waiting = queued.filter(q => !sent.has(q.id));
  const drafts = ws.drafts.filter(d => d.status === 'open').sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <section aria-labelledby="drafts-h" className="stack">
      <h3 id="drafts-h">Bozze</h3>
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
              {/* Towards the left «Sposta» opens the groups on the row (user's choice, 2026-11-17): sorting drafts one
                  after the other without opening them. Only here: a move between groups is rarer, and drops assignments. */}
              <SwipeRow left={{ label: 'Sposta', icon: 'groups', tone: 'go', run: () => setMoving(d.id) }}>
                <button className="item" style={{ '--grp': 'var(--muted)' } as React.CSSProperties} onClick={() => onOpen({ activityId: d.id })}>
                  <span className="bar" /><span><span className="t">{d.title}</span>{d.attachments.length > 0 && <><br /><span className="meta">{d.attachments.length} allegati</span></>}</span>
                  <span className="time">{d.createdAt.slice(5, 10).split('-').reverse().join('/')}</span>
                </button>
              </SwipeRow>
              {moving === d.id && <MoveMenu draft={d} onClose={() => setMoving(null)} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The groups a draft can go to, as the detail's «Sposta in un gruppo»: a tap moves it; a tap outside or Esc closes. */
function MoveMenu({ draft, onClose }: { draft: Activity; onClose(): void }) {
  const ws = useWs();
  const { account } = useSession();
  const toast = useToast();
  const box = useRef<HTMLSpanElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    box.current?.querySelector('.menu')?.scrollIntoView?.({ block: 'nearest' });
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close.current(); };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);
  const move = async (g: Group) => {
    onClose();
    try {
      await ws.save(moveToGroup(draft, g.id, account, instantNow()));
      toast({ text: `Spostata in ${groupName(g)}` });
    } catch (e) {
      toast({ text: errorText(e) });
    }
  };
  const targets = moveTargets(ws.groups, account, null);
  return (
    <span className="attach" ref={box}>
      <span role="menu" aria-label={`Sposta ${draft.title}`} className="menu" onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
        {targets.length === 0 ? <span className="menu-note">Nessun gruppo.</span>
          : targets.map(g => <MenuChoice key={g.id} label={groupName(g)} onChoose={() => void move(g)} />)}
      </span>
    </span>
  );
}
