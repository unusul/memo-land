import type { SupabaseClient } from '@supabase/supabase-js';

/** One passkey of the Vault: its PRF input and the Vault's key encrypted with what it gives (migration 0011). */
export interface VaultKeyRow { credentialId: string; prfSalt: string; wrappedKey: string; iv: string; label: string; createdAt?: string }
/** One entry: the title in clear, the value encrypted with the Vault's key. */
export interface VaultEntryRow { id: string; title: string; value: string; iv: string; updatedAt?: string }

/** The server side of the Vault (2026-11-20): only the central engine's session has one, the demo a pretend one. */
export interface VaultStore {
  keys(): Promise<VaultKeyRow[]>;
  addKey(k: VaultKeyRow): Promise<void>;
  removeKey(credentialId: string): Promise<void>;
  entries(): Promise<VaultEntryRow[]>;
  saveEntry(e: VaultEntryRow): Promise<void>;
  removeEntry(id: string): Promise<void>;
}

export function supabaseVault(db: SupabaseClient): VaultStore {
  const call = async <T>(fn: string, args?: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw error;
    return data as T;
  };
  return {
    keys: () => call<VaultKeyRow[]>('vault_keys_list'),
    addKey: k => call('vault_key_add', { credential_id: k.credentialId, prf_salt: k.prfSalt, wrapped_key: k.wrappedKey, iv: k.iv, label: k.label }),
    removeKey: id => call('vault_key_remove', { credential_id: id }),
    entries: () => call<VaultEntryRow[]>('vault_entries_list'),
    saveEntry: e => call('vault_entry_save', { id: e.id, title: e.title, value: e.value, iv: e.iv }),
    removeEntry: id => call('vault_entry_remove', { id }),
  };
}

/** In memory: the demo's Vault and the tests'. Entries by title, as the server lists them. */
export function memoryVault(): VaultStore {
  const keys = new Map<string, VaultKeyRow>();
  const entries = new Map<string, VaultEntryRow>();
  return {
    keys: async () => [...keys.values()],
    addKey: async k => { keys.set(k.credentialId, k); },
    removeKey: async id => { keys.delete(id); },
    entries: async () => [...entries.values()].sort((x, y) => x.title.toLowerCase().localeCompare(y.title.toLowerCase())),
    saveEntry: async e => { entries.set(e.id, e); },
    removeEntry: async id => { entries.delete(id); },
  };
}
