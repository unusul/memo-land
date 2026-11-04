import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Engine } from '@attivita/core';
import type { OpenedSession, Session } from './session.js';

const SessionContext = createContext<Session | null>(null);

export const SessionProvider = SessionContext.Provider;

/** Provides the session and lets the app connect more engines (e.g. a Google project) while it runs. */
export function SessionHost({ session, children }: { session: OpenedSession; children: ReactNode }) {
  const [engines, setEngines] = useState(session.engines);
  const value = useMemo<Session>(() => ({
    ...session, engines,
    addEngine: (e: Engine) => setEngines(list => (list.includes(e) ? list : [...list, e])),
  }), [session, engines]);
  return <SessionProvider value={value}>{children}</SessionProvider>;
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside SessionProvider');
  return s;
}
