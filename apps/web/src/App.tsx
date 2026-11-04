import { useEffect, useState } from 'react';
import { LoginScreen } from './session/LoginScreen.js';
import type { LoginActions } from './session/LoginScreen.js';
import { SessionHost } from './session/SessionContext.js';
import type { OpenSession, OpenedSession } from './session/session.js';
import { Shell } from './shell/Shell.js';
import { WorkspaceProvider } from './workspace/useWorkspace.js';

export function App({ open, login }: { open: OpenSession; login: LoginActions }) {
  const [session, setSession] = useState<OpenedSession | null | undefined>(undefined);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    open().then(setSession).catch(e => { setFailure(String(e?.message ?? e)); setSession(null); });
  }, [open]);

  if (session === undefined) return <p className="muted center">Apro memo-land…</p>;
  if (session === null) return <>{failure && <p className="error" role="alert">Accesso non riuscito: {failure}</p>}<LoginScreen actions={login} /></>;
  return (
    <SessionHost session={session}>
      <WorkspaceProvider><Shell /></WorkspaceProvider>
    </SessionHost>
  );
}
