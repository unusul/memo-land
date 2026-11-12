import { useCallback, useEffect, useState } from 'react';
import { groupTypeOf, newActivity } from '@attivita/core';
import { waitingIn } from '../groups/listGroup.js';
import type { Activity } from '@attivita/core';
import { instantNow, newId } from '../dates.js';
import { ActivityDetail } from '../activity/ActivityDetail.js';
import { AgendaView, KIND_COLOR } from '../agenda/AgendaView.js';
import type { OpenTarget } from '../agenda/AgendaView.js';
import { CaptureSheet } from '../capture/CaptureSheet.js';
import { GroupPage } from '../groups/GroupPage.js';
import { MAX_PINS, MENU_GROUPS, orderSharedGroups, useBarPrefs } from '../groups/barPrefs.js';
import { GroupIcon } from '../groups/GroupIcon.js';
import { GroupsView } from '../groups/GroupsView.js';
import { noteGroupOpened } from '../groups/order.js';
import { MeView } from '../me/MeView.js';
import { SettingsView } from '../settings/SettingsView.js';
import { flushOutbox } from '../offline/outbox.js';
import type { OutboxEntry } from '../offline/outbox.js';
import { useSession } from '../session/SessionContext.js';
import { useWs } from '../workspace/useWorkspace.js';
import { Icon } from './icons.js';
import { TodayTitle } from './TodayTitle.js';

export type Tab = 'agenda' | 'groups' | 'me' | 'settings';

export function Shell() {
  const { primary: engine, outbox, account } = useSession();
  const ws = useWs();
  useBarPrefs();
  // An invite link to a Google group opens the Groups tab, where the wizard waits.
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has('firebase') ? 'groups' : 'agenda'));
  const [open, setOpen] = useState<OpenTarget | null>(null);
  // The group whose page is shown, opened from the menu or the Gruppi page.
  const [groupId, setGroupId] = useState<string | null>(null);
  // One line after Chiudi saved a form left open, e.g. "Ripeti salvato".
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(null), 4000); return () => clearTimeout(t); }, [flash]);
  // The new activity being written on a group's page, not stored until it has a title.
  const [creating, setCreating] = useState<Activity | null>(null);
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
  // Io holds the drafts to sort and the captures the server refused.
  const forMe = waitingDrafts + refused;
  const go = (id: Tab) => { setTab(id); setGroupId(null); setOpen(null); setCreating(null); };
  const openGroup = (id: string) => { noteGroupOpened(account, id); setTab('groups'); setGroupId(id); setOpen(null); };
  const current = (id: Tab) => (tab === id && !groupId && !open ? 'page' : undefined);
  const menuGroups = orderSharedGroups(ws.groups, account).slice(0, MENU_GROUPS);
  // On a group's page the + opens a new activity of that group, in the detail; elsewhere it captures a draft.
  const here = tab === 'groups' && groupId && !open && !creating ? ws.groups.find(g => g.id === groupId) : undefined;
  // A list group's page has its own field to add items: no +.
  const onList = here !== undefined && (groupTypeOf(here) === 'list' || here.archived === true);
  const newIn = (id: string) => setCreating(newActivity({ id: newId(), accountId: ws.engineOf(id)?.account ?? account, title: '', groupId: id }, instantNow()));
  const plus = () => (here ? newIn(here.id) : setCapturing(true));
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
          <button className="gear" aria-label="Impostazioni" aria-current={current('settings')} onClick={() => go('settings')}><Icon name="settings" /></button>
        </div>
      </header>
      <main className="content">
        {ws.error && <p className="error" role="alert">{ws.error} <button className="link" onClick={ws.clearError}>Chiudi</button></p>}
        {ws.notices.map(n => <p key={n} className="muted small" role="status">{n}</p>)}
        {flash && <p className="flash" role="status">{flash}</p>}
        {creating ? (
          <ActivityDetail key={creating.id} activityId={creating.id} fresh={creating} onClose={message => { setCreating(null); refreshQueue(); if (message) setFlash(message); }} />
        ) : open ? (
          <ActivityDetail key={`${open.activityId}|${open.occurrenceKey ?? ''}`} activityId={open.activityId} occurrenceKey={open.occurrenceKey} onClose={message => { setOpen(null); if (message) setFlash(message); }} />
        ) : (
          <>
            {tab === 'agenda' && <AgendaView onOpen={setOpen} />}
            {tab === 'groups' && (groupId ? <GroupPage groupId={groupId} onOpen={setOpen} /> : <GroupsView onOpenGroup={openGroup} onNewActivity={id => { openGroup(id); newIn(id); }} />)}
            {tab === 'me' && <MeView onOpen={setOpen} />}
            {tab === 'settings' && <SettingsView />}
          </>
        )}
      </main>
      {capturing && <CaptureSheet onSaved={() => { setCapturing(false); go('me'); refreshQueue(); }} onClose={() => setCapturing(false)} />}
      {!capturing && !creating && !onList && <button className="fab" aria-label={here ? `Nuova attività in ${here.name}` : 'Nuova bozza'} onClick={plus}>+</button>}
      <nav className="tabs" aria-label="Sezioni">
        {entry('groups', 'Noi', 0)}
        {/* Pinned groups first, then the most opened: three on phones, five on wide screens. */}
        {menuGroups.map((g, i) => {
          const { n, words } = waitingIn(g, ws.activities);
          return (
            <button key={g.id} className={`sub${i >= MAX_PINS ? ' wide-only' : ''}`} style={{ '--grp': KIND_COLOR[g.kind] } as React.CSSProperties}
              aria-current={groupId === g.id && !open ? 'page' : undefined} aria-label={n ? `${g.name}, ${words}` : g.name}
              onClick={() => openGroup(g.id)}>
              <span className="tab-icon grp-icon"><GroupIcon group={g} account={account} />{n > 0 && <span className="badge soft">{n}</span>}</span>
              <span className="name">{g.name}</span>{n > 0 && <span className="n">{n}</span>}
            </button>
          );
        })}
        {entry('me', 'Io', forMe)}
      </nav>
    </div>
  );
}
