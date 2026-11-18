import type { ClipFrom } from '../groups/barPrefs.js';

/** «telefono», «tablet» or «computer», chosen by the app from the device (user's choice, 2026-11-17). */
export function deviceKind(ua = navigator.userAgent): ClipFrom {
  if (/iPhone|iPod|Android.*Mobile|Mobile.*Firefox|Windows Phone/i.test(ua)) return 'telefono';
  if (/iPad|Android|Tablet/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'tablet';
  return 'computer';
}

const LAST_KEY = 'attivita:last-clip';

/** The text last used or saved from the clipboard on this device: it is not offered again (user's choice, 2026-11-17). */
export function lastClip(): string {
  try { return localStorage.getItem(LAST_KEY) ?? ''; } catch { return ''; }
}
export function noteLastClip(text: string): void {
  try { localStorage.setItem(LAST_KEY, text); } catch { /* storage unavailable: it may be offered once more */ }
}

/**
 * The device's clipboard, text only, or '' when the browser does not give it: only over https and after a tap; Chrome
 * asks for the permission once; Safari on an iPhone shows its own «Incolla» bubble first.
 */
export async function readClipboard(): Promise<string> {
  try {
    return (await navigator.clipboard?.readText?.())?.trim() ?? '';
  } catch {
    return '';
  }
}
