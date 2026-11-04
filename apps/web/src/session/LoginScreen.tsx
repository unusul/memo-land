import { useState } from 'react';
import type { OAuthProvider } from './central.js';

export interface LoginActions {
  sendMagicLink(email: string): Promise<string | null>;
  signInWith(provider: OAuthProvider): Promise<void>;
  providers: OAuthProvider[];
}

const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: 'Entra con Google', azure: 'Entra con Microsoft' };

export function LoginScreen({ actions }: { actions: LoginActions }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    const err = await actions.sendMagicLink(email.trim());
    setError(err);
    setState(err ? 'idle' : 'sent');
  }

  return (
    <main className="login">
      <h1>memo-land</h1>
      <p className="muted">Idee, cose da fare e calendari per il tuo gruppo.</p>
      {state === 'sent' ? (
        <p role="status">Ti ho mandato un link a <b>{email}</b>: aprilo da questo dispositivo per entrare.</p>
      ) : (
        <form onSubmit={submit} className="stack">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} />
          <button className="btn primary" type="submit" disabled={state === 'sending' || !email.trim()}>Mandami il link</button>
          {error && <p className="error" role="alert">Non sono riuscito a mandare il link: {error}</p>}
        </form>
      )}
      {actions.providers.length > 0 && (
        <div className="stack">
          {actions.providers.map(p => <button key={p} className="btn" onClick={() => actions.signInWith(p)}>{PROVIDER_LABEL[p]}</button>)}
        </div>
      )}
    </main>
  );
}
