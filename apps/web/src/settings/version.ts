/** The app's version and the date of its last commit, written in at build time (`define` in vite.config.ts). */
export const APP_VERSION = __APP_VERSION__;
export const APP_DATE = __APP_DATE__;

/**
 * «memo-land 0.2.0 · 16/11/2026». The day is read from the ISO text as written in the commit, not converted to the
 * reader's time zone, so every phone shows the same day for the same build.
 */
export function versionLine(version: string, isoDate: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return day ? `memo-land ${version} · ${day[3]}/${day[2]}/${day[1]}` : `memo-land ${version}`;
}
