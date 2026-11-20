import { useSyncExternalStore } from 'react';
import { keyFromPrf, newVaultKey, openValue, sealValue, unwrapVaultKey, wrapVaultKey } from './crypto.js';
import { VaultError } from './passkey.js';
import type { PasskeyApi } from './passkey.js';
import type { VaultEntryRow, VaultStore } from './store.js';

/** A copy of the Vault's key for one more passkey, saved with the name the person gave it. */
async function keepFor(store: VaultStore, vaultKey: CryptoKey, made: { credentialId: string; prfSalt: string; prf: ArrayBuffer }, label: string) {
  const wrapped = await wrapVaultKey(vaultKey, await keyFromPrf(made.prf));
  await store.addKey({ credentialId: made.credentialId, prfSalt: made.prfSalt, wrappedKey: wrapped.value, iv: wrapped.iv, label });
}

/** The first passkey makes the Vault: a new key, kept for it. The Vault opens at once. */
export async function createVault(store: VaultStore, passkeys: PasskeyApi, label: string): Promise<CryptoKey> {
  const vaultKey = await newVaultKey();
  await keepFor(store, vaultKey, await passkeys.create(label), label);
  return vaultKey;
}

/** One more passkey (another device) for an open Vault. */
export async function addPasskey(store: VaultStore, passkeys: PasskeyApi, vaultKey: CryptoKey, label: string): Promise<void> {
  await keepFor(store, vaultKey, await passkeys.create(label), label);
}

/** Any of the passkeys registered opens the Vault; one that gives other bytes is `WRONG_KEY`. */
export async function unlockVault(store: VaultStore, passkeys: PasskeyApi): Promise<CryptoKey> {
  const keys = await store.keys();
  if (keys.length === 0) throw new VaultError('NO_PASSKEY');
  const got = await passkeys.unlock(keys);
  const row = keys.find(k => k.credentialId === got.credentialId);
  if (!row) throw new VaultError('WRONG_KEY');
  try {
    return await unwrapVaultKey({ value: row.wrappedKey, iv: row.iv }, await keyFromPrf(got.prf));
  } catch {
    throw new VaultError('WRONG_KEY');
  }
}

export async function saveEntry(store: VaultStore, vaultKey: CryptoKey, id: string, title: string, value: string): Promise<VaultEntryRow> {
  const sealed = await sealValue(vaultKey, value);
  const row = { id, title: title.trim(), value: sealed.value, iv: sealed.iv };
  await store.saveEntry(row);
  return row;
}

export const readEntry = (vaultKey: CryptoKey, e: VaultEntryRow): Promise<string> => openValue(vaultKey, { value: e.value, iv: e.iv });

/*
 * The open Vault's key, in memory only (user's choice, 2026-11-20): it stays open moving around the app, and closes with
 * «Blocca» or with the app. Never written anywhere.
 */
let openKey: CryptoKey | null = null;
const watchers = new Set<() => void>();
export function setVaultKey(key: CryptoKey | null): void { openKey = key; watchers.forEach(w => w()); }
const watch = (w: () => void) => { watchers.add(w); return () => { watchers.delete(w); }; };
export const useVaultKey = (): CryptoKey | null => useSyncExternalStore(watch, () => openKey);
