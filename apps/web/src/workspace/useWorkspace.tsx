import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { DomainError, EngineUnavailableError, archive, fail } from '@attivita/core';
import type { Activity, ActivityId, AttachmentRef, AttachmentUpload, Engine, Group, GroupId } from '@attivita/core';
import { instantNow } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { EngineRouter } from './routing.js';

export interface Workspace {
  groups: Group[];
  activities: Activity[];
  drafts: Activity[];
  loaded: boolean;
  error: string | null;
  /** One line per engine that cannot be reached right now; the others stay usable. */
  notices: string[];
  save(a: Activity): Promise<Activity>;
  /** `on` picks the engine for a new group (default: the primary one). */
  saveGroup(g: Group, on?: Engine): Promise<void>;
  reload(): Promise<void>;
  clearError(): void;
  /** The engine holding a group, once loaded. */
  engineOf(groupId: GroupId): Engine | undefined;
}

interface Slice { groups: Group[]; activities: Activity[] }
const EMPTY: Slice = { groups: [], activities: [] };

/** Loaded list wins on membership; for an activity in both, the higher version wins. */
export function mergeByVersion(current: Activity[], loaded: Activity[]): Activity[] {
  const byId = new Map(current.map(a => [a.id, a]));
  return loaded.map(l => {
    const c = byId.get(l.id);
    return c && c.version > l.version ? c : l;
  });
}

const isUnreachable = (e: unknown) => e instanceof EngineUnavailableError || e instanceof TypeError;
const unreachableText = (e: Engine) => `${e.kind === 'google' ? 'Un progetto Google' : 'Il server'} non è raggiungibile: mostro il resto.`;

/** After a move between engines the same id exists twice: the live copy wins, and a grouped one over a draft. */
function prefer(a: Activity, over: Activity): boolean {
  if ((a.status === 'archived') !== (over.status === 'archived')) return over.status === 'archived';
  return a.groupId !== null && over.groupId === null;
}

/** Keeps the same array while its elements are the same, so callers may pass a fresh literal each render. */
function useSameList<T>(list: T[]): T[] {
  const ref = useRef(list);
  if (list.length !== ref.current.length || list.some((x, i) => x !== ref.current[i])) ref.current = list;
  return ref.current;
}

/** The files of an activity leaving `from`, checked against the limit of `to` before anything is written there. */
async function readAttachments(refs: AttachmentRef[], from: Engine, to: Engine): Promise<AttachmentUpload[]> {
  const big = refs.find(f => f.size > to.limits.maxAttachmentBytes);
  if (big) fail('INVALID_INPUT', `attachment ${big.name} exceeds the size limit of the destination engine`);
  return Promise.all(refs.map(async f => ({ name: f.name, mimeType: f.mimeType, bytes: await from.getAttachment(f) })));
}

const replaceIn = (s: Slice, a: Activity): Slice => ({ ...s, activities: [...s.activities.filter(x => x.id !== a.id), a] });

/**
 * Loads everything the account can see on every engine (engines[0] is the primary one, home of the drafts)
 * and keeps each fresh by polling its change feed. Saves go to the engine that owns the group.
 */
export function useWorkspace(engineList: Engine[]): Workspace {
  const engines = useSameList(engineList);
  const [slices, setSlices] = useState<ReadonlyMap<Engine, Slice>>(new Map());
  const [down, setDown] = useState<ReadonlySet<Engine>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cursors = useRef(new Map<Engine, string | null>());
  const latest = useRef(new Map<Engine, number>());
  const primary = engines[0]!;

  const updateSlice = useCallback((e: Engine, fn: (s: Slice) => Slice) => {
    setSlices(prev => new Map(prev).set(e, fn(prev.get(e) ?? EMPTY)));
  }, []);

  const markDown = useCallback((e: Engine, isDown: boolean) => setDown(prev => {
    if (prev.has(e) === isDown) return prev;
    const next = new Set(prev);
    if (isDown) next.add(e); else next.delete(e);
    return next;
  }), []);

  const loadEngine = useCallback(async (e: Engine) => {
    const seq = (latest.current.get(e) ?? 0) + 1;
    latest.current.set(e, seq);
    try {
      // Cursor first: a change committed while we list is seen again on the next poll, never absorbed.
      const next = (await e.changesSince(cursors.current.get(e) ?? null)).cursor;
      const gs = await e.listGroups();
      const lists = await Promise.all([...(e === primary ? [e.listActivities(null)] : []), ...gs.map(g => e.listActivities(g.id))]);
      if (seq !== latest.current.get(e)) return;
      cursors.current.set(e, next);
      updateSlice(e, s => ({ groups: gs, activities: mergeByVersion(s.activities, lists.flat()) }));
      markDown(e, false);
    } catch (err) {
      if (isUnreachable(err)) markDown(e, true); else setError(errorText(err));
    }
  }, [primary, updateSlice, markDown]);

  const reload = useCallback(async () => {
    await Promise.all(engines.map(loadEngine));
    setLoaded(true);
  }, [engines, loadEngine]);

  useEffect(() => {
    void reload();
    const timers = engines.map(e => setInterval(() => {
      e.changesSince(cursors.current.get(e) ?? null).then(r => { if (r.changes.length) return loadEngine(e); })
        .catch(() => undefined);
    }, e.limits.refreshIntervalSeconds * 1000));
    return () => timers.forEach(clearInterval);
  }, [engines, reload, loadEngine]);

  const view = useMemo(() => {
    const router = new EngineRouter(engines);
    const holder = new Map<ActivityId, Engine>();
    const byId = new Map<ActivityId, Activity>();
    const groups: Group[] = [];
    for (const e of engines) {
      const s = slices.get(e);
      if (!s) continue;
      router.register(s.groups, e);
      groups.push(...s.groups);
      for (const a of s.activities) {
        const seen = byId.get(a.id);
        if (!seen || prefer(a, seen)) { byId.set(a.id, a); holder.set(a.id, e); }
      }
    }
    return { router, holder, groups, all: [...byId.values()] };
  }, [engines, slices]);

  /** A draft moved into a group of another engine: a copy there (same id, history kept), then archive here. */
  const moveAcross = useCallback(async (a: Activity, from: Engine, to: Engine) => {
    const original = slices.get(from)?.activities.find(x => x.id === a.id) ?? a;
    const files = await readAttachments(a.attachments, from, to);
    let copy = await to.saveActivity({ ...a, attachments: [], version: 1 }, null);
    if (files.length) {
      const refs = await Promise.all(files.map(f => to.putAttachment(a.id, f)));
      copy = await to.saveActivity({ ...copy, attachments: refs }, copy.version);
    }
    updateSlice(to, s => replaceIn(s, copy));
    const archived = await from.saveActivity(archive(original, from.account, instantNow()), original.version);
    updateSlice(from, s => replaceIn(s, archived));
    return copy;
  }, [slices, updateSlice]);

  const save = useCallback(async (a: Activity) => {
    const source = view.holder.get(a.id);
    let target: Engine | undefined;
    try {
      target = view.router.forGroup(a.groupId);
      if (source && source !== target) return await moveAcross(a, source, target);
      // The version the user edited, not whatever a reload put in state meanwhile.
      const saved = await target.saveActivity(a, source ? a.version : null);
      updateSlice(target, s => replaceIn(s, saved));
      setError(null);
      return saved;
    } catch (e) {
      if (target && e instanceof DomainError && e.code === 'VERSION_CONFLICT') {
        const fresh = (await target.getActivity(a.id)).activity;
        updateSlice(target, s => replaceIn(s, fresh));
      }
      setError(errorText(e));
      throw e;
    }
  }, [view, moveAcross, updateSlice]);

  const saveGroup = useCallback(async (g: Group, on?: Engine) => {
    const stored = view.groups.find(x => x.id === g.id);
    const engine = on ?? (stored ? view.router.forGroup(g.id) : primary);
    try {
      await engine.saveGroup(g, stored ? stored.version : null);
      await loadEngine(engine);
    } catch (e) {
      setError(errorText(e));
      await loadEngine(engine);
      throw e;
    }
  }, [view, primary, loadEngine]);

  return {
    groups: view.groups, loaded, error, save, saveGroup, reload, clearError: () => setError(null),
    engineOf: (groupId: GroupId) => { try { return view.router.forGroup(groupId); } catch { return undefined; } },
    notices: [...new Set([...down].map(unreachableText))],
    activities: view.all.filter(a => a.groupId !== null),
    drafts: view.all.filter(a => a.groupId === null && a.accountId === primary.account),
  };
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const ws = useWorkspace(useSession().engines);
  return <WorkspaceContext.Provider value={ws}>{children}</WorkspaceContext.Provider>;
}

export function useWs(): Workspace {
  const ws = useContext(WorkspaceContext);
  if (!ws) throw new Error('useWs outside WorkspaceProvider');
  return ws;
}
