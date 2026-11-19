import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const proxyTarget = loadEnv('development', __dirname, '')['SUPABASE_PROXY_TARGET'];
/** Where the app is served: `/` locally, `/memo-land/` on GitHub Pages (set by the publishing workflow). */
const base = process.env['BASE_PATH'] ?? '/';
/** Shown at the bottom of Impostazioni: the version is raised by hand in package.json, the date is the last commit's. */
const appVersion = (JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')) as { version: string }).version;
const appDate = lastCommitDate();

function lastCommitDate(): string {
  try {
    return execSync('git log -1 --format=%cI', { cwd: __dirname, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  root: __dirname,
  base,
  define: { __APP_VERSION__: JSON.stringify(appVersion), __APP_DATE__: JSON.stringify(appDate) },
  // Local development: the browser talks to /sb on localhost, forwarded to Supabase in the VM.
  server: proxyTarget ? { proxy: { '/sb': { target: proxyTarget, changeOrigin: true, rewrite: p => p.replace(/^\/sb/, '') } } } : {},
  plugins: [
    react(),
    // version.json beside the app, not precached: the band of a new version reads the number it is about to load.
    { name: 'version-file', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ version: appVersion, date: appDate }) }); } },
    VitePWA({
      // A new version waits for Aggiorna in the app's band (user's choice, 2026-11-17): reloading by itself could lose
      // what is being written. Registered by the app (shell/appUpdate.tsx), not by an injected script.
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'memo-land',
        short_name: 'memo-land',
        description: 'Idee, cose da fare e calendari per piccoli gruppi',
        lang: 'it',
        display: 'standalone',
        // Under the base path, so the installed app opens where it is published.
        start_url: base,
        scope: base,
        theme_color: '#3b46c9',
        background_color: '#f3f4f8',
        // PNGs too: some Android launchers ignore an SVG. The maskable one keeps its drawing in the safe zone, so the
        // launcher's shape (circle, squircle) cuts only the background.
        icons: [
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // Condividi on Android (user's choice, 2026-11-17): memo-land among the apps that take a text or a link; it opens
        // the capture with it in the field. iPhones have no such place for web apps.
        share_target: { action: base, method: 'GET', params: { title: 'title', text: 'text', url: 'url' } },
        shortcuts: [{ name: 'Nuova bozza', short_name: 'Bozza', url: `${base}?capture=1`, icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] }],
      },
      // The runtime inside sw.js (2026-11-19): loaded apart with importScripts, a copy installed without it failed at
      // every start, before listening for Aggiorna, so the band stayed and the tap did nothing.
      workbox: { navigateFallback: `${base}index.html`, globPatterns: ['**/*.{js,css,html,svg}'], inlineWorkboxRuntime: true },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
