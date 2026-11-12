import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const proxyTarget = loadEnv('development', __dirname, '')['SUPABASE_PROXY_TARGET'];
/** Where the app is served: `/` locally, `/memo-land/` on GitHub Pages (set by the publishing workflow). */
const base = process.env['BASE_PATH'] ?? '/';

export default defineConfig({
  root: __dirname,
  base,
  // Local development: the browser talks to /sb on localhost, forwarded to Supabase in the VM.
  server: proxyTarget ? { proxy: { '/sb': { target: proxyTarget, changeOrigin: true, rewrite: p => p.replace(/^\/sb/, '') } } } : {},
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
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
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        shortcuts: [{ name: 'Nuova bozza', short_name: 'Bozza', url: `${base}?capture=1`, icons: [{ src: 'icon.svg', sizes: 'any' }] }],
      },
      workbox: { navigateFallback: `${base}index.html`, globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
