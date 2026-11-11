import { useState } from 'react';
import { useSession } from '../session/SessionContext.js';
import { Icon } from '../shell/icons.js';
import { loadTheme, saveTheme } from './theme.js';
import type { Theme } from './theme.js';

const THEMES: Array<[Theme, string, 'auto' | 'sun' | 'moon']> = [['auto', 'Automatico', 'auto'], ['light', 'Chiaro', 'sun'], ['dark', 'Scuro', 'moon']];

/** The person's settings, opened from the gear in the header: account and theme today, notifications and linked accounts later. */
export function SettingsView() {
  const { account, signOut } = useSession();
  const [theme, setTheme] = useState(loadTheme);
  const choose = (t: Theme) => { saveTheme(t); setTheme(t); };
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
      <button className="btn" onClick={() => { void signOut().then(() => window.location.reload()); }}>Esci dall'account</button>
    </section>
  );
}
