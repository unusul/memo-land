import { useState } from 'react';
import type { AccountId } from '@attivita/core';
import { chosenName, setName, useBarPrefs } from '../groups/barPrefs.js';
import { shortName } from '../labels.js';
import { useWs } from '../workspace/useWorkspace.js';
import { startDemo } from '../demo/demo.js';
import { retryPrefsSync, useSyncStatus } from './prefsSync.js';
import { useSession } from '../session/SessionContext.js';
import { Icon } from '../shell/icons.js';
import { loadTheme, saveTheme } from './theme.js';
import type { Theme } from './theme.js';
import { APP_DATE, APP_VERSION, versionLine } from './version.js';

const THEMES: Array<[Theme, string, 'auto' | 'sun' | 'moon']> = [['auto', 'Automatico', 'auto'], ['light', 'Chiaro', 'sun'], ['dark', 'Scuro', 'moon']];

/** The person's settings, opened from the gear in the header: account and theme today, notifications and linked accounts later. */
export function SettingsView({ onHelp }: { onHelp?(): void } = {}) {
  const { account, signOut, demo, prefs } = useSession();
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
      <People account={account} />
      <SyncLine kept={prefs !== undefined} />
      {onHelp &&<button className="btn" onClick={onHelp}>Aiuto e glossario</button>}
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
      <p className="muted small">{versionLine(APP_VERSION, APP_DATE)}</p>
    </section>
  );
}

/** Where the sync of the bar, the icons and the theme stands; Riprova after a failure. */
function SyncLine({ kept }: { kept: boolean }) {
  const s = useSyncStatus();
  const what = 'Barra, icone, tema e nomi';
  if (!kept) return <p className="muted small">{what}: restano in questo browser</p>;
  if (s.state === 'failed') {
    return (
      <p className="small sync-line">{what}: non salvati{s.offline ? ': senza rete' : ''}
        <button className="link" onClick={retryPrefsSync}>Riprova</button></p>
    );
  }
  const said = s.state === 'pending' ? 'in attesa di salvare' : s.state === 'saved' ? `salvati sull'account${s.at ? ` alle ${s.at}` : ''}` : 'in attesa di salvare';
  return <p className="muted small">{what}: {said}</p>;
}

/**
 * Persone: the person first («tu»; 2026-11-18, they missed themselves), then everyone in their groups by the name they see, each with their email and the groups
 * in common; the pencil gives a name seen only by the person, everywhere in the app; an empty one gives the email's back
 * (user's choice, 2026-11-18: one name per person, here and not in each group).
 */
function People({ account }: { account: AccountId }) {
  const ws = useWs();
  useBarPrefs();
  const [editing, setEditing] = useState<AccountId | null>(null);
  // On a Google group the person is that project's account: it is them too.
  const mine = new Set([account, ...ws.groups.map(g => ws.engineOf(g.id)?.account).filter((a): a is AccountId => a !== undefined)]);
  const shared = new Map<AccountId, string[]>();
  for (const g of ws.groups) {
    for (const m of Object.keys(g.members)) shared.set(m, [...(shared.get(m) ?? []), g.name]);
  }
  if (!shared.has(account)) shared.set(account, []);
  const people = [...shared].sort(([x], [y]) => Number(mine.has(y)) - Number(mine.has(x)) || Number(y === account) - Number(x === account)
    || shortName(x).localeCompare(shortName(y), 'it', { sensitivity: 'base' }));
  return (
    <div role="group" aria-label="Persone" className="people">
      <p className="label">Persone · il nome che vedi tu</p>
      <ul className="people-list">
        {people.map(([who, groups]) => (
          <li key={who}>
            {editing === who
              ? <NameEdit who={who} done={name => { if (name !== undefined) setName(account, who, name); setEditing(null); }} />
              : <>
                <span className="people-name">{shortName(who)}<span className="muted small">{[mine.has(who) ? 'tu' : '', who, groups.join(', ')].filter(Boolean).join(' · ')}</span></span>
                <button type="button" className="icon-choice small" aria-label={`Dai un nome a ${who}`} title="Dai un nome" onClick={() => setEditing(who)}><Icon name="edit" size={16} /></button>
              </>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The name's field: Enter, ✓ or leaving keep what is typed, Esc gives up; `done` gets undefined when given up. */
function NameEdit({ who, done }: { who: AccountId; done(name: string | undefined): void }) {
  const [text, setText] = useState(chosenName(who) ?? '');
  return (
    <form className="new-item-row" onSubmit={e => { e.preventDefault(); done(text); }}>
      <input className="new-item" aria-label={`Nome di ${who}`} placeholder={who.split('@')[0]} autoFocus value={text}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); done(undefined); } }}
        onBlur={e => { if (!(e.relatedTarget instanceof Element && e.relatedTarget.closest('.new-item-row'))) done(text); }} />
      <button type="submit" className="icon-choice" aria-label="Salva il nome" title="Salva il nome" onPointerDown={e => e.preventDefault()}><Icon name="check" /></button>
    </form>
  );
}
