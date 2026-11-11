import { useEffect, useState } from 'react';
import { errorCodeText } from '../labels.js';
import type { OutboxEntry } from '../offline/outbox.js';
import { useSession } from '../session/SessionContext.js';

export function MeView() {
  const { account, outbox, signOut } = useSession();
  const [queue, setQueue] = useState<OutboxEntry[] | null>(null);

  useEffect(() => { outbox.list(account).then(setQueue).catch(() => setQueue(null)); }, [account, outbox]);
  const waiting = queue?.filter(e => !e.error).length ?? 0;
  const refused = queue?.filter(e => e.error) ?? [];

  return (
    <section aria-labelledby="me-h" className="stack">
      <h2 id="me-h">Io</h2>
      <dl className="kv"><dt>Account</dt><dd>{account}</dd></dl>
      {waiting > 0 && <p>{waiting === 1 ? '1 bozza in attesa di rete' : `${waiting} bozze in attesa di rete`}: partiranno appena torna la connessione.</p>}
      {refused.length > 0 && (
        <div className="attention">
          <h3>Non accettate dal server</h3>
          <ul className="items" aria-label="Non accettate dal server">
            {refused.map(e => (
              <li key={e.id} className="item">
                <span className="bar" style={{ background: 'var(--bad)' }} /><span><span className="t">{e.activity.title}</span><br /><span className="meta">{errorCodeText(e.error!)}</span></span><span />
              </li>
            ))}
          </ul>
        </div>
      )}
      <button className="btn" onClick={() => { void signOut().then(() => window.location.reload()); }}>Esci dall'account</button>
    </section>
  );
}
