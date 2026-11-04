import { useEffect, useState } from 'react';
import { ActivityDetail } from '../activity/ActivityDetail.js';
import { AgendaView } from '../agenda/AgendaView.js';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { CaptureSheet } from '../capture/CaptureSheet.js';
import { DraftsView } from '../drafts/DraftsView.js';
import { GroupsView } from '../groups/GroupsView.js';
import { MeView } from '../me/MeView.js';
import { flushOutbox } from '../offline/outbox.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';

export type Tab = 'agenda' | 'drafts' | 'groups' | 'me';

export function Shell() {
  const { engine, outbox } = useSession();
  const ws = useWs();
  const [tab, setTab] = useState<Tab>('agenda');
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [capturing, setCapturing] = useState(() => new URLSearchParams(window.location.search).has('capture'));

  // Queued drafts leave at startup and whenever the connection comes back.
  useEffect(() => {
    const flush = () => { flushOutbox(outbox, engine).then(r => { if (r.sent) void ws.reload(); }).catch(() => undefined); };
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, outbox]);

  const tabs: Array<[Tab, string]> = [['agenda', 'Agenda'], ['drafts', `Bozze (${ws.drafts.filter(d => d.status === 'open').length})`], ['groups', 'Gruppi'], ['me', 'Io']];
  return (
    <div className="app">
      <main className="content">
        {ws.error && <p className="error" role="alert">{ws.error} <button className="link" onClick={ws.clearError}>Chiudi</button></p>}
        {open ? (
          <ActivityDetail key={`${open.activityId}|${open.occurrenceKey ?? ''}`} activityId={open.activityId} occurrenceKey={open.occurrenceKey} onClose={() => setOpen(null)} />
        ) : (
          <>
            {tab === 'agenda' && <AgendaView onOpen={setOpen} />}
            {tab === 'drafts' && <DraftsView onOpen={setOpen} />}
            {tab === 'groups' && <GroupsView />}
            {tab === 'me' && <MeView />}
          </>
        )}
      </main>
      {capturing && <CaptureSheet onSaved={() => { setCapturing(false); setTab('drafts'); }} onClose={() => setCapturing(false)} />}
      {!capturing && <button className="fab" aria-label="Nuova bozza" onClick={() => setCapturing(true)}>+</button>}
      <nav className="tabs" aria-label="Sezioni">
        {tabs.map(([id, label]) => <button key={id} aria-current={tab === id && !open ? 'page' : undefined} onClick={() => { setTab(id); setOpen(null); }}>{label}</button>)}
      </nav>
    </div>
  );
}
