import { useEffect, useState } from 'react';
import { useSession } from '../session/SessionContext.js';

export function MeView() {
  const { account, outbox, signOut } = useSession();
  const [queued, setQueued] = useState<number | null>(null);

  useEffect(() => { outbox.list(account).then(l => setQueued(l.length)).catch(() => setQueued(null)); }, [account, outbox]);

  return (
    <section aria-labelledby="me-h" className="stack">
      <h2 id="me-h">Io</h2>
      <dl className="kv"><dt>Account</dt><dd>{account}</dd></dl>
      {queued !== null && queued > 0 && <p>{queued === 1 ? '1 bozza in attesa di rete' : `${queued} bozze in attesa di rete`}: partiranno appena torna la connessione.</p>}
      <button className="btn" onClick={() => { void signOut().then(() => window.location.reload()); }}>Esci dall'account</button>
    </section>
  );
}
