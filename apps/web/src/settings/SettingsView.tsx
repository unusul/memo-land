import { useState } from 'react';
import { startDemo } from '../demo/demo.js';
import { useSession } from '../session/SessionContext.js';
import { Icon } from '../shell/icons.js';
import { loadTheme, saveTheme } from './theme.js';
import type { Theme } from './theme.js';

const THEMES: Array<[Theme, string, 'auto' | 'sun' | 'moon']> = [['auto', 'Automatico', 'auto'], ['light', 'Chiaro', 'sun'], ['dark', 'Scuro', 'moon']];

/** The person's settings, opened from the gear in the header: account and theme today, notifications and linked accounts later. */
export function SettingsView({ onHelp }: { onHelp?(): void } = {}) {
  const { account, signOut, demo } = useSession();
  const [theme, setTheme] = useState(loadTheme);
  const choose = (t: Theme) => { saveTheme(t); setTheme(t); };
  const [leaving, setLeaving] = useState(false);
  return (
    <section aria-labelledby="settings-h" className="stack">
      <h2 id="settings-h">Impostazioni</h2>
      <dl className="kv"><dt>Account</dt><dd>{account}</dd></dl>
      <div className="kv-row">
        <span className="muted">Tema</span>
        <div className="icon-row" role="radiogroup" aria-label="Tema">
          {THEMES.map(([t, label, icon]) => (
            <button key={t} role="radio" aria-checked={theme === t} className="icon-choice" aria-label={label} title={label} onClick={() => choose(t)}><Icon name={icon} /></button>
          ))}
        </div>
      </div>
      {onHelp && <button className="btn" onClick={onHelp}>Aiuto e glossario</button>}
      {/* In the demo there is no account to leave: only the demo, and nothing to lose by it. */}
      {demo ? <button className="btn" onClick={() => void signOut()}>Esci dalla demo</button> : <>
      <button className="btn" onClick={startDemo}>Prova con dati di esempio</button>
      {/* Asked first, as leaving a group: a stray tap would mean waiting for a new link by email to get back in. */}
      {leaving ? (
        <div className="btns">
          <button className="btn primary" onClick={() => { void signOut().then(() => window.location.reload()); }}>Conferma uscita</button>
          <button className="btn" onClick={() => setLeaving(false)}>Annulla</button>
        </div>
      ) : <button className="btn" onClick={() => setLeaving(true)}>Esci dall'account</button>}
      </>}
    </section>
  );
}
