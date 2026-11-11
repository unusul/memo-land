import { useCallback, useEffect, useState } from 'react';
import { ActivityDetail } from '../activity/ActivityDetail.js';
import { AgendaView, KIND_COLOR } from '../agenda/AgendaView.js';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { CaptureSheet } from '../capture/CaptureSheet.js';
import { DraftsView } from '../drafts/DraftsView.js';
import { GroupPage } from '../groups/GroupPage.js';
import { GroupsView, groupName } from '../groups/GroupsView.js';
import { noteGroupOpened, orderGroups } from '../groups/order.js';
import { MeView } from '../me/MeView.js';
import { flushOutbox } from '../offline/outbox.js';
import type { OutboxEntry } from '../offline/outbox.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { Icon } from './icons.js';
import { TodayTitle } from './TodayTitle.js';

export type Tab = 'agenda' | 'drafts' | 'groups' | 'me';

/** Groups shown under Gruppi in the menu; the rest are on the Gruppi page. */
const MENU_GROUPS = 5;

export function Shell() {
  const { primary: engine, outbox, account } = useSession();
  const ws = useWs();
  // An invite link to a Google group opens the Groups tab, where the wizard waits.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has('firebase') ? 'groups' : 'agenda'));
  const [open, setOpen] = useState<OpenTarget | null>(null);
  // The group whose page is shown, opened from the menu or the Gruppi page.
  const [groupId, setGroupId] = useState<string | null>(null);
  // One line after Chiudi saved a form left open, e.g. "Ripeti salvato".
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 4000); return () => clearTimeout(t); }, [flash]);
  const [capturing, setCapturing] = useState(() => new URLSearchParams(window.location.search).has('capture'));

  // What is still in the outbox: drafts waiting for the network, and drafts the server refused.
  const [queue, setQueue] = useState<OutboxEntry[]>([]);
  const refreshQueue = useCallback(() => { outbox.list(account).then(setQueue).catch(() => setQueue([])); }, [outbox, account]);
  useEffect(refreshQueue, [refreshQueue, ws.drafts]);

  // Queued drafts leave at startup and whenever the connection comes back.
  useEffect(() => {
    const flush = () => { flushOutbox(outbox, engine).then(r => { refreshQueue(); if (r.sent) void ws.reload(); }).catch(() => undefined); };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, outbox]);

  // A number only where something waits for the person; none at zero. What waits in the agenda is in the header.
  const onServer = new Set(ws.drafts.map(d => d.id));
  const waitingDrafts = ws.drafts.filter(d => d.status === 'open').length + queue.filter(e => !e.error && !onServer.has(e.activity.id)).length;
  const refused = queue.filter(e => e.error).length;
  const go = (id: Tab) => { setTab(id); setGroupId(null); setOpen(null); };
  const openGroup = (id: string) => { noteGroupOpened(account, id); setTab('groups'); setGroupId(id); setOpen(null); };
  const current = (id: Tab) => (tab === id && !groupId && !open ? 'page' : undefined);
  const openCount = (id: string) => ws.activities.filter(a => a.groupId === id && a.status === 'open').length;
  const menuGroups = orderGroups(ws.groups, account).slice(0, MENU_GROUPS);
  const entry = (id: Tab, label: string, count: number) => (
    <button key={id} aria-current={current(id)} aria-label={count ? `${label}, ${count} da vedere` : label} onClick={() => go(id)}>
      <span className="tab-icon"><Icon name={id} />{count > 0 && <span className="badge">{count}</span>}</span>{label}
    </button>
  );
  return (
    <div className="app">
      <header className="top">
        <div className="wrap">
          <TodayTitle current={current('agenda') === 'page'} onClick={() => go('agenda')} />
        </div>
      </header>
      <main className="content">
        {ws.error && <p className="error" role="alert">{ws.error} <button className="link" onClick={ws.clearError}>Chiudi</button></p>}
        {ws.notices.map(n => <p key={n} className="muted small" role="status">{n}</p>)}
        {flash && <p className="flash" role="status">{flash}</p>}
        {open ? (
          <ActivityDetail key={`${open.activityId}|${open.occurrenceKey ?? ''}`} activityId={open.activityId} occurrenceKey={open.occurrenceKey} onClose={message => { setOpen(null); if (message) setFlash(message); }} />
        ) : (
          <>
            {tab === 'agenda' && <AgendaView onOpen={setOpen} />}
            {tab === 'drafts' && <DraftsView onOpen={setOpen} />}
            {tab === 'groups' && (groupId ? <GroupPage groupId={groupId} onOpen={setOpen} /> : <GroupsView onOpenGroup={openGroup} />)}
            {tab === 'me' && <MeView />}
          </>
        )}
      </main>
      {capturing && <CaptureSheet onSaved={() => { setCapturing(false); setTab('drafts'); refreshQueue(); }} onClose={() => setCapturing(false)} />}
      {!capturing && <button className="fab" aria-label="Nuova bozza" onClick={() => setCapturing(true)}>+</button>}
      <nav className="tabs" aria-label="Sezioni">
        {entry('groups', 'Gruppi', 0)}
        {/* On wide screens the most used groups sit under Gruppi; on phones the Gruppi page lists them. */}
        {menuGroups.map(g => {
          const n = openCount(g.id);
          return (
            <button key={g.id} className="sub" style={{ '--grp': KIND_COLOR[g.kind] } as React.CSSProperties}
              aria-current={groupId === g.id && !open ? 'page' : undefined} aria-label={n ? `${groupName(g)}, ${n} ${n === 1 ? 'aperta' : 'aperte'}` : groupName(g)}
              onClick={() => openGroup(g.id)}>
              <span className="dot" />{groupName(g)}{n > 0 && <span className="n">{n}</span>}
            </button>
          );
        })}
        {entry('drafts', 'Bozze', waitingDrafts)}
        {entry('me', 'Io', refused)}
      </nav>
    </div>
  );
}
