import { b64, randomBytes, unb64 } from './crypto.js';

/**
 * The passkeys that open the Vault (user's choice, 2026-11-20: no passphrase, only the device's key). Each gives the
 * same 32 bytes for the same input (WebAuthn's PRF extension), from which the key comes. Tried on the user's devices
 * the same day (prf-test.html): Windows Hello gives them when the passkey is made but refuses them on unlock, in Chrome
 * and Firefox alike; a passkey in Google's password manager gives them both times, on the PC and on the phone.
 */
export interface PasskeyApi {
  /** A new passkey and its PRF output; throws `VaultError('NO_PRF')` where the device gives none. */
  create(label: string): Promise<{ credentialId: string; prfSalt: string; prf: ArrayBuffer }>;
  /** One of these passkeys, chosen by the person, and its PRF output. */
  unlock(keys: ReadonlyArray<{ credentialId: string; prfSalt: string }>): Promise<{ credentialId: string; prf: ArrayBuffer }>;
  /**
   * Tells the password manager that a passkey no longer opens anything (2026-11-20), so it can take it away: a page
   * cannot delete a passkey itself. Chrome's Signal API; elsewhere it does nothing, and it never fails.
   */
  forget(credentialId: string): Promise<void>;
}

export type VaultErrorCode = 'NO_PRF' | 'CANCELLED' | 'NOT_OPENED' | 'NO_PASSKEY' | 'WRONG_KEY';
export class VaultError extends Error {
  constructor(readonly code: VaultErrorCode) { super(code); }
}

/** What the person reads for each failure. */
export const VAULT_ERROR: Record<VaultErrorCode, string> = {
  NO_PRF: 'Questa chiave non dà una chiave per cifrare. Su Windows salva la passkey nel Gestore password di Google, non in Windows Hello.',
  CANCELLED: 'Annullato, o il tempo è scaduto: riprova.',
  // An unlock the browser could not do tells nothing more: no passkey there (deleted from the password manager, the
  // user's case of 2026-11-20) reads as a cancel. The way out is said.
  NOT_OPENED: "Non sbloccato: annullato, tempo scaduto o passkey non trovata. Se la passkey non c'è più, usa «Ricomincia da capo…».",
  NO_PASSKEY: 'Il browser non ha le passkey.',
  WRONG_KEY: 'Questa chiave non apre il Vault.',
};

const prfOf = (c: PublicKeyCredential): ArrayBuffer | undefined =>
  (c.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }).prf?.results?.first;

/** A cancelled or timed out prompt is a NotAllowedError; anything else goes on as it is. */
const cancelled = (e: unknown): never => {
  if (e instanceof DOMException && e.name === 'NotAllowedError') throw new VaultError('CANCELLED');
  throw e;
};

export function browserPasskeys(): PasskeyApi {
  const ready = () => { if (!window.PublicKeyCredential || !navigator.credentials) throw new VaultError('NO_PASSKEY'); };
  const get = async (keys: ReadonlyArray<{ credentialId: string; prfSalt: string }>) => {
    const got = await navigator.credentials.get({ publicKey: {
      challenge: randomBytes(32), userVerification: 'required',
      allowCredentials: keys.map(k => ({ type: 'public-key' as const, id: unb64(k.credentialId) })),
      extensions: { prf: { evalByCredential: Object.fromEntries(keys.map(k => [k.credentialId, { first: unb64(k.prfSalt) }])) } },
    } as PublicKeyCredentialRequestOptions }).catch(cancelled) as PublicKeyCredential | null;
    if (!got) throw new VaultError('CANCELLED');
    const prf = prfOf(got);
    if (!prf) throw new VaultError('NO_PRF');
    return { credentialId: b64(got.rawId), prf };
  };
  return {
    async create(label) {
      ready();
      const salt = randomBytes(32);
      const made = await navigator.credentials.create({ publicKey: {
        rp: { name: 'memo-land' },
        user: { id: randomBytes(16), name: `memo-land Vault · ${label}`, displayName: `memo-land Vault · ${label}` },
        challenge: randomBytes(32),
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        extensions: { prf: { eval: { first: salt } } },
      } as PublicKeyCredentialCreationOptions }).catch(cancelled) as PublicKeyCredential | null;
      if (!made) throw new VaultError('CANCELLED');
      const credentialId = b64(made.rawId);
      const prfSalt = b64(salt);
      const now = prfOf(made);
      if (now) return { credentialId, prfSalt, prf: now };
      // Some devices give the PRF only on an unlock: one more prompt, right away.
      const ext = made.getClientExtensionResults() as { prf?: { enabled?: boolean } };
      if (ext.prf?.enabled === false) throw new VaultError('NO_PRF');
      return { credentialId, prfSalt, prf: (await get([{ credentialId, prfSalt }])).prf };
    },
    async unlock(keys) {
      ready();
      return get(keys);
    },
    async forget(credentialId) {
      const signal = (window.PublicKeyCredential as unknown as { signalUnknownCredential?(o: { rpId: string; credentialId: string }): Promise<void> } | undefined)?.signalUnknownCredential;
      try { await signal?.call(window.PublicKeyCredential, { rpId: location.hostname, credentialId }); } catch { /* only a hint */ }
    },
  };
}
