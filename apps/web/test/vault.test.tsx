import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { b64, keyFromPrf, newVaultKey, openValue, sealValue, unb64, unwrapVaultKey, wrapVaultKey } from '../src/vault/crypto.js';
import { VaultError } from '../src/vault/passkey.js';
import type { PasskeyApi } from '../src/vault/passkey.js';
import { memoryVault } from '../src/vault/store.js';
import { addPasskey, createVault, readEntry, saveEntry, setVaultKey, unlockVault } from '../src/vault/vault.js';
import { VaultSection } from '../src/vault/VaultSection.js';
import { ToastHost } from '../src/shell/toast.js';
import { memorySession, renderWithSession } from './memory-session.js';

afterEach(() => setVaultKey(null));

/** 32 bytes a passkey would give for its salt: here a hash of the two, so the same passkey gives the same bytes. */
const prfOf = async (id: string, salt: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${id}|${salt}`));

/**
 * Passkeys in memory, as the device would hold them: `pick` says which one the person chooses on unlock, `liar` gives
 * other bytes than the ones it gave on creation (a passkey that does not open the Vault).
 */
function fakePasskeys(o: { pick?: (ids: string[]) => string; liar?: boolean } = {}): PasskeyApi & { made: string[]; forgotten: string[] } {
  const made: string[] = [];
  const forgotten: string[] = [];
  return {
    made,
    forgotten,
    async forget(id) { forgotten.push(id); },
    async create(label) {
      const credentialId = b64(new TextEncoder().encode(`${label}-${made.length}`));
      const prfSalt = b64(crypto.getRandomValues(new Uint8Array(32)));
      made.push(credentialId);
      return { credentialId, prfSalt, prf: await prfOf(credentialId, prfSalt) };
    },
    async unlock(keys) {
      const id = o.pick ? o.pick(keys.map(k => k.credentialId)) : keys[0]!.credentialId;
      const k = keys.find(x => x.credentialId === id)!;
      return { credentialId: id, prf: await prfOf(id, o.liar ? 'other' : k.prfSalt) };
    },
  };
}

/** Base64url both ways, and the values sealed and opened with the Vault's key, each with its own nonce. */
test('testTheVaultsCryptography', async () => {
  const bytes = crypto.getRandomValues(new Uint8Array(40));
  expect([...unb64(b64(bytes))]).toEqual([...bytes]);
  const key = await newVaultKey();
  const one = await sealValue(key, 'pin 1234 · àèé');
  const two = await sealValue(key, 'pin 1234 · àèé');
  expect(one.value).not.toBe(two.value);
  expect(one.value).not.toContain('1234');
  expect(await openValue(key, one)).toBe('pin 1234 · àèé');
  await expect(openValue(await newVaultKey(), one)).rejects.toBeTruthy();
});

/** The Vault's key wrapped for a passkey comes back only with that passkey's bytes. */
test('testTheKeyComesBackOnlyWithItsPasskey', async () => {
  const vaultKey = await newVaultKey();
  const mine = await keyFromPrf(await prfOf('a', 's'));
  const wrapped = await wrapVaultKey(vaultKey, mine);
  const back = await unwrapVaultKey(wrapped, await keyFromPrf(await prfOf('a', 's')));
  const sealed = await sealValue(vaultKey, 'x');
  expect(await openValue(back, sealed)).toBe('x');
  await expect(unwrapVaultKey(wrapped, await keyFromPrf(await prfOf('b', 's')))).rejects.toBeTruthy();
});

/**
 * Made with the PC's passkey, a second one added for the phone: either opens the Vault and reads the same value; a
 * passkey that gives other bytes is `WRONG_KEY`; the store keeps only ciphertext.
 */
test('testAnyPasskeyOpensTheVault', async () => {
  const store = memoryVault();
  const passkeys = fakePasskeys();
  const key = await createVault(store, passkeys, 'PC');
  await saveEntry(store, key, 'e1', 'Wi-Fi casa', 'segreta-42');
  await addPasskey(store, passkeys, key, 'Telefono');
  expect((await store.keys()).map(k => k.label)).toEqual(['PC', 'Telefono']);
  const [entry] = await store.entries();
  expect(entry!.value).not.toContain('segreta');
  for (const id of passkeys.made) {
    const opened = await unlockVault(store, fakePasskeys({ pick: () => id }));
    expect(await readEntry(opened, entry!)).toBe('segreta-42');
  }
  await expect(unlockVault(store, fakePasskeys({ liar: true }))).rejects.toEqual(new VaultError('WRONG_KEY'));
  await expect(unlockVault(memoryVault(), passkeys)).rejects.toEqual(new VaultError('NO_PASSKEY'));
});

function renderVault(passkeys: PasskeyApi, store = memoryVault()) {
  renderWithSession(<ToastHost><VaultSection passkeys={passkeys} /></ToastHost>, { ...memorySession(), vault: store });
  return store;
}

/**
 * In Io (2026-11-20): «Crea il Vault» with the warning, an entry added, its value hidden then shown; «Blocca» hides the
 * actions and the value, «Sblocca» gives them back; an entry taken away comes back with Annulla.
 */
test('testTheVaultInIo', async () => {
  renderVault(fakePasskeys());
  expect(await screen.findByText(/Se perdi tutte le passkey del Vault/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Crea il Vault' }));
  const add = await screen.findByRole('button', { name: 'Aggiungi' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Titolo' }), { target: { value: 'Wi-Fi casa' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Valore' }), { target: { value: 'segreta-42' } });
  fireEvent.click(add);
  const list = await screen.findByRole('list', { name: 'Voci del Vault' });
  await within(list).findByText('Wi-Fi casa');
  expect(within(list).queryByText('segreta-42')).toBeNull();
  fireEvent.click(within(list).getByRole('button', { name: 'Mostra Wi-Fi casa' }));
  expect(await within(list).findByText('segreta-42')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Blocca' }));
  await waitFor(() => expect(within(list).queryByText('segreta-42')).toBeNull());
  expect(within(list).queryByRole('button', { name: 'Mostra Wi-Fi casa' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Sblocca' }));
  fireEvent.click(await within(list).findByRole('button', { name: 'Togli Wi-Fi casa' }));
  await waitFor(() => expect(within(list).queryByText('Wi-Fi casa')).toBeNull());
  fireEvent.click(within((await screen.findByText(/tolta dal Vault/)).closest('.toast') as HTMLElement).getByRole('button', { name: 'Annulla' }));
  expect(await within(list).findByText('Wi-Fi casa')).toBeTruthy();
});

/** A passkey that does not open it says so in words, and the Vault stays locked. */
test('testAWrongPasskeySaysSo', async () => {
  const store = memoryVault();
  const key = await createVault(store, fakePasskeys(), 'PC');
  await saveEntry(store, key, 'e1', 'Banca', '000');
  await act(async () => { renderVault(fakePasskeys({ liar: true }), store); });
  fireEvent.click(await screen.findByRole('button', { name: 'Sblocca' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Questa chiave non apre il Vault.');
  expect(screen.queryByRole('button', { name: 'Mostra Banca' })).toBeNull();
});

/** The last passkey cannot be taken away: without it the Vault would never open again. */
test('testTheLastPasskeyStays', async () => {
  const store = memoryVault();
  setVaultKey(await createVault(store, fakePasskeys(), 'PC'));
  renderVault(fakePasskeys(), store);
  const keys = await screen.findByRole('list', { name: 'Chiavi del Vault' });
  expect((within(keys).getByRole('button', { name: 'Togli' }) as HTMLButtonElement).disabled).toBe(true);
});

/** Without a Vault in the session (Google engines only, tests of other views) Io shows nothing of it. */
test('testNoVaultWithoutItsStore', () => {
  const { vault: _none, ...session } = { ...memorySession(), vault: undefined };
  renderWithSession(<VaultSection />, session);
  expect(screen.queryByRole('region', { name: 'Vault' })).toBeNull();
});

/**
 * A Vault whose passkey was deleted from the password manager (user's case, 2026-11-20): locked for good, it starts
 * again with «Ricomincia da capo…», after a confirmation; entries and keys go, the password manager is told.
 * Before, nothing could be taken away without opening it.
 */
test('testALostVaultStartsAgain', async () => {
  const store = memoryVault();
  const first = fakePasskeys();
  await saveEntry(store, await createVault(store, first, 'PC'), 'e1', 'test1', 'x');
  const passkeys = fakePasskeys();
  renderVault(passkeys, store);
  fireEvent.click(await screen.findByRole('button', { name: 'Ricomincia da capo…' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Ricomincia da capo' })).getByRole('button', { name: 'Annulla' }));
  expect(await store.entries()).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Ricomincia da capo…' }));
  fireEvent.click(screen.getByRole('button', { name: 'Togli tutto' }));
  expect(await screen.findByRole('button', { name: 'Crea il Vault' })).toBeTruthy();
  expect(await store.entries()).toEqual([]);
  expect(await store.keys()).toEqual([]);
  expect(passkeys.forgotten).toEqual(first.made);
});

/** An unlock the browser could not do (a passkey deleted, a cancel) says where to go next. */
test('testANotOpenedVaultPointsToStartingAgain', async () => {
  const store = memoryVault();
  await createVault(store, fakePasskeys(), 'PC');
  const gone: PasskeyApi = { ...fakePasskeys(), unlock: async () => { throw new VaultError('CANCELLED'); } };
  await expect(unlockVault(store, gone)).rejects.toEqual(new VaultError('NOT_OPENED'));
});
