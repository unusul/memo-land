import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DomainError } from '@attivita/core';
import type { Activity, Engine, Group } from '@attivita/core';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';

export interface Workspace {
  groups: Group[];
  activities: Activity[];
  drafts: Activity[];
  loaded: boolean;
  error: string | null;
  save(a: Activity): Promise<Activity>;
  saveGroup(g: Group): Promise<void>;
  reload(): Promise<void>;
  clearError(): void;
}

/** Loaded list wins on membership; for an activity in both, the higher version wins. */
export function mergeByVersion(current: Activity[], loaded: Activity[]): Activity[] {
  const byId = new Map(current.map(a => [a.id, a]));
  return loaded.map(l => {
    const c = byId.get(l.id);
    return c && c.version > l.version ? c : l;
  });
}

/** Loads everything the account can see and keeps it fresh by polling the engine's change feed. */
export function useWorkspace(engine: Engine): Workspace {
  const [groups, setGroups] = useState<Group[]>([]);
  const [all, setAll] = useState<Activity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const latest = useRef(0);

  const reload = useCallback(async () => {
    const seq = ++latest.current;
    // Cursor first: a change committed while we list is seen again on the next poll, never absorbed.
    const next = (await engine.changesSince(cursor.current)).cursor;
    const gs = await engine.listGroups();
    const lists = await Promise.all([engine.listActivities(null), ...gs.map(g => engine.listActivities(g.id))]);
    if (seq !== latest.current) return;
    cursor.current = next;
    setGroups(gs);
    setAll(current => mergeByVersion(current, lists.flat()));
    setLoaded(true);
  }, [engine]);

  useEffect(() => {
    reload().catch(e => setError(errorText(e)));
    const timer = setInterval(() => {
      engine.changesSince(cursor.current).then(r => { if (r.changes.length) return reload(); })
        .catch(() => undefined);
    }, engine.limits.refreshIntervalSeconds * 1000);
    return () => clearInterval(timer);
  }, [engine, reload]);

  const replace = (a: Activity) => setAll(list => [...list.filter(x => x.id !== a.id), a]);

  const save = useCallback(async (a: Activity) => {
    const known = all.some(x => x.id === a.id);
    try {
      // The version the user edited, not whatever a reload put in state meanwhile.
      const saved = await engine.saveActivity(a, known ? a.version : null);
      replace(saved);
      setError(null);
      return saved;
    } catch (e) {
      if (e instanceof DomainError && e.code === 'VERSION_CONFLICT') replace((await engine.getActivity(a.id)).activity);
      setError(errorText(e));
      throw e;
    }
  }, [engine, all]);

  const saveGroup = useCallback(async (g: Group) => {
    const stored = groups.find(x => x.id === g.id);
    try {
      await engine.saveGroup(g, stored ? stored.version : null);
      await reload();
    } catch (e) {
      setError(errorText(e));
      await reload();
      throw e;
    }
  }, [engine, groups, reload]);

  return {
    groups, loaded, error, save, saveGroup, reload, clearError: () => setError(null),
    activities: all.filter(a => a.groupId !== null),
    drafts: all.filter(a => a.groupId === null && a.accountId === engine.account),
  };
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace(useSession().engine);
  return <WorkspaceContext.Provider value={ws}>{children}</WorkspaceContext.Provider>;
}

export function useWs(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error('useWs outside WorkspaceProvider');
  return ws;
}
