/**
 * The app's own address, base path included: `/` locally, `/memo-land/` on GitHub Pages. Sign-in links and provider
 * logins come back here; the bare origin would land outside the app when it is not at the root.
 */
export function appHome(origin: string = window.location.origin, base: string = import.meta.env.BASE_URL): string {
  return new URL(base, origin).href;
}
