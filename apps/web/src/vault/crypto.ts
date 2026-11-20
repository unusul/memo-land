/*
 * The Vault's cryptography (user's choices, 2026-11-20), with the browser's own Web Crypto: no dependency. The Vault
 * has a key of its own (AES-GCM, 256 bits, random); each passkey keeps a copy of it, encrypted with a key derived
 * (HKDF) from what the passkey gives through WebAuthn's PRF extension. Values are encrypted with the Vault's key; the
 * server only ever sees base64url ciphertext.
 */

const text = new TextEncoder();

/** Bytes as base64url, no padding: what the tables keep. */
export function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const randomBytes = (n: number): Uint8Array<ArrayBuffer> => crypto.getRandomValues(new Uint8Array(new ArrayBuffer(n)));

/** A new Vault key, random; extractable, as each new passkey needs its own copy of it. */
export const newVaultKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

/** The key a passkey's PRF output gives, to encrypt the Vault's key with. */
export async function keyFromPrf(prf: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', prf instanceof Uint8Array ? prf.slice().buffer : prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: text.encode('memo-land vault key') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export interface Sealed { value: string; iv: string }

async function seal(key: CryptoKey, bytes: Uint8Array<ArrayBuffer>): Promise<Sealed> {
  const iv = randomBytes(12);
  return { value: b64(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes)), iv: b64(iv) };
}

const open = (key: CryptoKey, { value, iv }: Sealed): Promise<ArrayBuffer> =>
  crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(value));

/** The Vault's key encrypted for one passkey. */
export async function wrapVaultKey(vaultKey: CryptoKey, passkeyKey: CryptoKey): Promise<Sealed> {
  return seal(passkeyKey, new Uint8Array(await crypto.subtle.exportKey('raw', vaultKey)));
}

/** The Vault's key back from one passkey's copy; a wrong passkey makes AES-GCM fail. */
export async function unwrapVaultKey(wrapped: Sealed, passkeyKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', await open(passkeyKey, wrapped), 'AES-GCM', true, ['encrypt', 'decrypt']);
}

export const sealValue = (vaultKey: CryptoKey, value: string): Promise<Sealed> => seal(vaultKey, text.encode(value));

export async function openValue(vaultKey: CryptoKey, sealed: Sealed): Promise<string> {
  return new TextDecoder().decode(await open(vaultKey, sealed));
}
