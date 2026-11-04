import { useState } from 'react';
import type { Engine, Group } from '@attivita/core';
import { newId } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import type { FirebaseWebConfig } from '../session/google-config.js';
import {
  emulatorHosts, engineForProject, inviteLink, parseFirebaseConfig, registerGoogleEngine, rememberProject,
} from '../session/google-config.js';
import { useWs } from '../workspace/useWorkspace.js';
import { FIRESTORE_RULES } from './firebase-rules.js';

export type ConnectProject = (config: FirebaseWebConfig, email: string) => Promise<Engine>;

const connectForReal: ConnectProject = async (config, email) =>
  (await import('../session/google.js')).connectGoogleProject(config, { email, emulator: emulatorHosts() });

export const appBase = () => window.location.origin + window.location.pathname;

async function copy(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}

/**
 * Opens a group on the person's own Firebase project: create the project, enable Firestore and Google login,
 * publish the rules, paste the configuration. With `invite` it only connects to the project of a group
 * the person was invited to.
 */
export function GoogleGroupWizard({ connect = connectForReal, invite, onDone }: { connect?: ConnectProject; invite?: FirebaseWebConfig; onDone(): void }) {
  const { account, addEngine, engines } = useSession();
  const ws = useWs();
  const [step, setStep] = useState(invite ? 3 : 0);
  const [text, setText] = useState(invite ? JSON.stringify(invite, null, 2) : '');
  const [engine, setEngine] = useState<{ engine: Engine; config: FirebaseWebConfig } | null>(null);
  const [name, setName] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function connectProject() {
    const config = parseFirebaseConfig(text);
    if (!config) { setProblem('Non trovo apiKey, authDomain, projectId e appId: incolla la configurazione intera.'); return; }
    setBusy(true); setProblem(null);
    try {
      const e = engineForProject(engines, config.projectId) ?? await connect(config, account);
      registerGoogleEngine(e, config);
      rememberProject(config);
      addEngine(e);
      setEngine({ engine: e, config });
      setStep(4);
    } catch (err) {
      setProblem(`Collegamento non riuscito: ${errorText(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function create(ev: React.FormEvent) {
    ev.preventDefault();
    if (!engine) return;
    const me = engine.engine.account;
    const g: Group = {
      id: `g:${newId()}`, kind: 'invite', name: name.trim(), ownerId: me,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Rome', members: { [me]: 'owner' }, version: 1,
    };
    setBusy(true); setProblem(null);
    try {
      await ws.saveGroup(g, engine.engine);
      setLink(inviteLink(engine.config, appBase()));
    } catch (err) {
      setProblem(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const nav = (
    <div className="btns">
      {step > 0 && step < 4 && !invite && <button className="btn" type="button" onClick={() => setStep(s => s - 1)}>Indietro</button>}
      {step < 3 && <button className="btn primary" type="button" onClick={() => setStep(s => s + 1)}>Avanti</button>}
      <button className="btn" type="button" onClick={onDone}>{step === 4 ? 'Fine' : 'Annulla'}</button>
    </div>
  );

  return (
    <section aria-label="Nuovo gruppo su Google" className="card stack">
      {step === 0 && <>
        <h3>1. Crea un progetto Firebase</h3>
        <p>Apri la <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">console di Firebase</a> con il tuo account Google e crea un progetto. Il piano gratuito (Spark) basta, senza carta.</p>
        <p className="muted small">Il progetto resta tuo: i dati del gruppo stanno lì, non su un server di memo-land.</p>
      </>}
      {step === 1 && <>
        <h3>2. Attiva Firestore e il login Google</h3>
        <ol className="small">
          <li>Build → Firestore Database → Crea database (modalità produzione, regione vicina a te).</li>
          <li>Build → Authentication → Inizia → Metodo di accesso: attiva Google.</li>
          <li>Authentication → Impostazioni → Domini autorizzati: aggiungi <code>{window.location.hostname}</code>.</li>
        </ol>
      </>}
      {step === 2 && <>
        <h3>3. Pubblica le regole</h3>
        <p className="small">Firestore Database → Regole: sostituisci il testo con questo e premi Pubblica. Sono le regole che fanno rispettare membri e ruoli.</p>
        <pre className="rules">{FIRESTORE_RULES}</pre>
        <button className="btn" type="button" onClick={() => void copy(FIRESTORE_RULES).then(ok => setCopied(ok ? 'regole' : null))}>Copia</button>
        {copied === 'regole' && <span className="small">Copiate.</span>}
      </>}
      {step === 3 && <>
        <h3>{invite ? 'Collega il gruppo a cui ti hanno invitato' : '4. Incolla la configurazione'}</h3>
        {!invite && <p className="small">Impostazioni progetto → Le tue app → aggiungi un'app web → copia il blocco <code>firebaseConfig</code>.</p>}
        <label htmlFor="fb-config">Configurazione</label>
        <textarea id="fb-config" rows={8} value={text} onChange={e => setText(e.target.value)} />
        <button className="btn primary" type="button" disabled={busy || !text.trim()} onClick={() => void connectProject()}>Collega</button>
      </>}
      {step === 4 && engine && <>
        <h3>Collegato a {engine.config.projectId}</h3>
        <p className="small">Sei entrato come {engine.engine.account}.{invite ? ' I gruppi a cui ti hanno invitato compaiono in Gruppi.' : ''}</p>
        {!link && !invite && (
          <form className="form" onSubmit={create}>
            <label htmlFor="g-name">Nome del gruppo</label>
            <input id="g-name" required value={name} onChange={e => setName(e.target.value)} />
            <button className="btn primary" type="submit" disabled={busy || !name.trim()}>Crea gruppo</button>
          </form>
        )}
        {link && <InviteLink link={link} />}
      </>}
      {problem && <p className="error" role="alert">{problem}</p>}
      {nav}
    </section>
  );
}

/** Whoever joins a Google group opens this link once: it carries only the project's public configuration. */
export function InviteLink({ link }: { link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="stack">
      <p className="small">Invita le persone dal gruppo (Invita), poi manda loro questo link: lo aprono una volta per collegarsi al progetto.</p>
      <input aria-label="Link d'invito" readOnly value={link} onFocus={e => e.currentTarget.select()} />
      <button className="btn" type="button" onClick={() => void copy(link).then(setCopied)}>Copia link d'invito</button>
      {copied && <span className="small">Copiato.</span>}
    </div>
  );
}
