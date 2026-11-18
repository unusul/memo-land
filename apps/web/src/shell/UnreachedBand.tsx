import { useState } from 'react';
import type { Engine } from '@attivita/core';
import { errorText } from '../labels.js';
import { emulatorHosts, registerGoogleEngine, rememberedProjects } from '../session/google-config.js';
import type { FirebaseWebConfig } from '../session/google-config.js';
import { useSession } from '../session/SessionContext.js';
import { Icon } from './icons.js';

/** Signs in to a project's Google login again, as its first connection did. */
export type Reconnect = (config: FirebaseWebConfig, email: string) => Promise<Engine>;
const reconnectForReal: Reconnect = async (config, email) =>
  (await import('../session/google.js')).connectGoogleProject(config, { email, emulator: emulatorHosts() });

/**
 * A Google project connected before that did not open again: its groups are missing, and this band says so (user's
 * bug, 2026-11-18: they went without a word). Without a valid login, «Accedi di nuovo» opens Google's sign-in as the
 * first connection did and the groups come back without a reload (user's choice, 2026-11-18); on any other error,
 * Riprova opens the page again. The x puts the band away until then.
 */
export function UnreachedBand({ reconnect = reconnectForReal }: { reconnect?: Reconnect }) {
  const { unreached, account, addEngine } = useSession();
  const [back, setBack] = useState<ReadonlySet<string>>(new Set());
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const left = (unreached ?? []).filter(u => !back.has(u.projectId));
  if (left.length === 0 || hidden) return null;

  async function signInAgain(projectId: string) {
    const config = rememberedProjects().find(c => c.projectId === projectId);
    if (!config) return;
    setBusy(projectId); setProblem(null);
    try {
      const e = await reconnect(config, account);
      registerGoogleEngine(e, config);
      addEngine(e);
      setBack(prev => new Set(prev).add(projectId));
    } catch (err) {
      setProblem(`Accesso non riuscito: ${errorText(err)}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="demo-band unreached-band" role="alert" aria-label="Progetti Google non raggiunti">
      <ul className="unreached-list">
        {left.map(u => (
          <li key={u.projectId}>
            <span>Il progetto Google {u.projectId} non si è riaperto: i suoi gruppi per ora non si vedono.</span>
            {u.reason === 'signedOut'
              ? <button type="button" className="link" disabled={busy !== null} onClick={() => void signInAgain(u.projectId)}>Accedi di nuovo</button>
              : <button type="button" className="link" onClick={() => window.location.reload()}>Riprova</button>}
          </li>
        ))}
      </ul>
      {problem && <span className="error small">{problem}</span>}
      <button type="button" className="link close" aria-label="Chiudi" onClick={() => setHidden(true)}><Icon name="close" size={16} /></button>
    </section>
  );
}
