/** The person's theme in this browser: `auto` follows the system; the choice is read again by index.html before paint. */
export type Theme = 'auto' | 'light' | 'dark';

const KEY = 'attivita:theme';
/** The header's surface colour per theme, for the phone's status bar (kept in step with styles.css and index.html). */
const BAR = { light: '#ffffff', dark: '#1b1e28' } as const;

export function loadTheme(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}

const listeners = new Set<() => void>();

/** Calls `listener` when the theme is chosen; returns the way to stop. */
export function onThemeChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function saveTheme(theme: Theme): void {
  try { if (theme === 'auto') localStorage.removeItem(KEY); else localStorage.setItem(KEY, theme); } catch { /* storage unavailable: the choice lasts this visit */ }
  applyTheme(theme);
  listeners.forEach(l => l());
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme; else root.dataset.theme = theme;
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const own = (meta.getAttribute('media') ?? '').includes('dark') ? BAR.dark : BAR.light;
    meta.setAttribute('content', theme === 'auto' ? own : BAR[theme]);
  }
}
