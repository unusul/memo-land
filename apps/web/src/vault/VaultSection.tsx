import { useEffect, useMemo, useState } from 'react';
import { newId } from '../dates.js';
import { errorText } from '../labels.js';
import { useSession } from '../session/SessionContext.js';
import { Icon } from '../shell/icons.js';
import { useToast } from '../shell/toast.js';
import { VAULT_ERROR, VaultError, browserPasskeys } from './passkey.js';
import type { PasskeyApi } from './passkey.js';
import type { VaultEntryRow, VaultKeyRow, VaultStore } from './store.js';
import { addPasskey, createVault, readEntry, resetVault, saveEntry, setVaultKey, unlockVault, useVaultKey } from './vault.js';

const problemOf = (e: unknown): string => (e instanceof VaultError ? VAULT_ERROR[e.code] : errorText(e));
/** The name a new passkey gets to start with: where it was made. */
const deviceName = (): string => (/Android|iPhone|iPad/i.test(navigator.userAgent) ? 'Telefono' : 'PC');

/**
 * The Vault in Io (user's choices, 2026-11-20): entries with a title in clear and a value only the person reads, opened
 * with a passkey (no passphrase). Locked, only the titles show; open, each value is shown or copied on request. Before,
 * an idea of encrypted memos, set aside the same day: «facciamo molto semplice».
 */
export function VaultSection({ passkeys }: { passkeys?: PasskeyApi } = {}) {
  const { vault } = useSession();
  if (!vault) return null;
  return <VaultBody store={vault} passkeys={passkeys} />;
}

function VaultBody({ store, passkeys: given }: { store: VaultStore; passkeys?: PasskeyApi | undefined }) {
  const passkeys = useMemo(() => given ?? browserPasskeys(), [given]);
  const key = useVaultKey();
  const toast = useToast();
  const [keys, setKeys] = useState<VaultKeyRow[] | null>(null);
  const [entries, setEntries] = useState<VaultEntryRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const load = async () => { const [k, e] = await Promise.all([store.keys(), store.entries()]); setKeys(k); setEntries(e); };
  useEffect(() => { load().catch(e => setProblem(problemOf(e))); }, [store]);
  const run = async (job: () => Promise<void>) => {
    setBusy(true); setProblem(null);
    try { await job(); } catch (e) { setProblem(problemOf(e)); } finally { setBusy(false); }
  };

  const remove = (e: VaultEntryRow) => run(async () => {
    await store.removeEntry(e.id);
    await load();
    toast({ text: `«${e.title}» tolta dal Vault`, undo: () => { void store.saveEntry(e).then(load); } });
  });

  return (
    <div className="stack vault" role="region" aria-label="Vault">
      <div className="vault-head">
        <h3><Icon name="lock" size={18} /> Vault</h3>
        {key && <button type="button" className="btn" onClick={() => setVaultKey(null)}>Blocca</button>}
      </div>
      {problem && <p className="error" role="alert">{problem}</p>}
      {keys === null ? <p className="muted">Apro il Vault…</p>
        : keys.length === 0 ? <CreateVault busy={busy} onCreate={label => run(async () => { setVaultKey(await createVault(store, passkeys, label)); await load(); })} />
        : <>
          {!key && <p className="vault-locked">
            <span className="muted">{entries.length === 0 ? 'Nessuna voce.' : 'Bloccato: i valori si vedono dopo lo sblocco.'}</span>
            <button type="button" className="btn primary" disabled={busy} onClick={() => run(async () => setVaultKey(await unlockVault(store, passkeys)))}>Sblocca</button>
            {!resetting && <button type="button" className="link" onClick={() => setResetting(true)}>Ricomincia da capo…</button>}
          </p>}
          {!key && resetting && (
            <div className="vault-reset" role="group" aria-label="Ricomincia da capo">
              <p className="warn">Togli tutte le voci e le chiavi del Vault? I valori non si possono recuperare.</p>
              <button type="button" className="btn" disabled={busy}
                onClick={() => run(async () => { await resetVault(store, passkeys); setResetting(false); await load(); })}>Togli tutto</button>
              <button type="button" className="btn" onClick={() => setResetting(false)}>Annulla</button>
            </div>
          )}
          <ul className="vault-list" aria-label="Voci del Vault">
            {entries.map(e => <EntryRow key={e.id} entry={e} vaultKey={key} store={store} onSaved={load} onRemove={() => remove(e)} onProblem={setProblem} />)}
          </ul>
          {key && <NewEntry onAdd={(title, value) => run(async () => { await saveEntry(store, key, newId(), title, value); await load(); })} />}
          {key && <Passkeys keys={keys} busy={busy}
            onAdd={label => run(async () => { await addPasskey(store, passkeys, key, label); await load(); })}
            onRemove={k => run(async () => { await store.removeKey(k.credentialId); await passkeys.forget(k.credentialId); await load(); })} />}
        </>}
    </div>
  );
}

/** The first time: what a passkey is for, and that losing them all loses the values. */
function CreateVault({ busy, onCreate }: { busy: boolean; onCreate(label: string): void }) {
  const [label, setLabel] = useState(deviceName);
  return (
    <form className="vault-create stack" onSubmit={e => { e.preventDefault(); if (label.trim()) onCreate(label.trim()); }}>
      <p className="muted">Titolo e valore; il valore lo leggi solo tu, sbloccandolo con la chiave del dispositivo (impronta, volto o PIN). Su Windows salva la passkey nel Gestore password di Google.</p>
      <p className="warn">Se perdi tutte le passkey del Vault, i valori sono persi: nessuno può recuperarli.</p>
      <label className="muted">Nome di questa chiave <input value={label} maxLength={60} onChange={e => setLabel(e.target.value)} /></label>
      <button type="submit" className="btn primary" disabled={busy || !label.trim()}>Crea il Vault</button>
    </form>
  );
}

/** A title and its value: hidden, shown or copied on request, changed or taken away (with Annulla). */
function EntryRow({ entry, vaultKey, store, onSaved, onRemove, onProblem }: {
  entry: VaultEntryRow; vaultKey: CryptoKey | null; store: VaultStore; onSaved(): Promise<void>; onRemove(): void; onProblem(p: string): void;
}) {
  const toast = useToast();
  const [shown, setShown] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ title: string; value: string } | null>(null);
  useEffect(() => { if (!vaultKey) { setShown(null); setEditing(null); } }, [vaultKey]);
  const read = () => readEntry(vaultKey!, entry);
  const copy = async () => {
    try { await navigator.clipboard.writeText(await read()); toast({ text: `«${entry.title}» copiato` }); } catch (e) { onProblem(problemOf(e)); }
  };
  if (editing && vaultKey) {
    return (
      <li className="vault-entry editing">
        <EntryFields title={editing.title} value={editing.value} submit="Salva"
          onSubmit={(title, value) => { void saveEntry(store, vaultKey, entry.id, title, value).then(onSaved).then(() => setEditing(null)).catch(e => onProblem(problemOf(e))); }}
          onCancel={() => setEditing(null)} />
      </li>
    );
  }
  return (
    <li className="vault-entry">
      <span className="t">{entry.title}</span>
      <span className="v">{shown ?? '••••••••'}</span>
      {vaultKey && <span className="vault-actions">
        <button type="button" className="icon-choice small" aria-label={shown === null ? `Mostra ${entry.title}` : `Nascondi ${entry.title}`}
          onClick={() => { if (shown !== null) setShown(null); else void read().then(setShown).catch(e => onProblem(problemOf(e))); }}><Icon name={shown === null ? 'eye' : 'eyeOff'} size={16} /></button>
        <button type="button" className="icon-choice small" aria-label={`Copia ${entry.title}`} onClick={() => void copy()}><Icon name="copy" size={16} /></button>
        <button type="button" className="icon-choice small" aria-label={`Modifica ${entry.title}`}
          onClick={() => { void read().then(value => setEditing({ title: entry.title, value })).catch(e => onProblem(problemOf(e))); }}><Icon name="edit" size={16} /></button>
        <button type="button" className="icon-choice small" aria-label={`Togli ${entry.title}`} onClick={onRemove}><Icon name="trash" size={16} /></button>
      </span>}
    </li>
  );
}

function EntryFields({ title: t0, value: v0, submit, onSubmit, onCancel }: {
  title: string; value: string; submit: string; onSubmit(title: string, value: string): void; onCancel?(): void;
}) {
  const [title, setTitle] = useState(t0);
  const [value, setValue] = useState(v0);
  const ok = title.trim() !== '' && value !== '';
  return (
    <form className="vault-fields" onSubmit={e => { e.preventDefault(); if (ok) { onSubmit(title, value); if (!onCancel) { setTitle(''); setValue(''); } } }}>
      <input aria-label="Titolo" placeholder="Titolo" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />
      <input aria-label="Valore" placeholder="Valore" value={value} autoComplete="off" spellCheck={false} onChange={e => setValue(e.target.value)} />
      <button type="submit" className="btn primary" disabled={!ok}>{submit}</button>
      {onCancel && <button type="button" className="btn" onClick={onCancel}>Annulla</button>}
    </form>
  );
}

function NewEntry({ onAdd }: { onAdd(title: string, value: string): void }) {
  return <EntryFields title="" value="" submit="Aggiungi" onSubmit={onAdd} />;
}

/** The passkeys that open the Vault: one more for another device, or one taken away (never the last). */
function Passkeys({ keys, busy, onAdd, onRemove }: { keys: VaultKeyRow[]; busy: boolean; onAdd(label: string): void; onRemove(k: VaultKeyRow): void }) {
  const [label, setLabel] = useState('');
  return (
    <details className="vault-keys">
      <summary>Chiavi che aprono il Vault ({keys.length})</summary>
      <ul aria-label="Chiavi del Vault">
        {keys.map(k => (
          <li key={k.credentialId}>
            <span>{k.label}</span>
            <button type="button" className="link" disabled={keys.length === 1 || busy} title={keys.length === 1 ? 'È l\'unica: senza, il Vault non si apre più' : undefined}
              onClick={() => onRemove(k)}>Togli</button>
          </li>
        ))}
      </ul>
      <form className="vault-fields" onSubmit={e => { e.preventDefault(); if (label.trim()) { onAdd(label.trim()); setLabel(''); } }}>
        <input aria-label="Nome della nuova chiave" placeholder="Nome (es. iPhone)" value={label} maxLength={60} onChange={e => setLabel(e.target.value)} />
        <button type="submit" className="btn" disabled={busy || !label.trim()}>Aggiungi una passkey</button>
      </form>
    </details>
  );
}
