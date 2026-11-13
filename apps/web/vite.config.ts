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
        shortcuts: [{ name: 'Nuova bozza', short_name: 'Bozza', url: `${base}?capture=1`, icons: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }] }],
      },
      workbox: { navigateFallback: `${base}index.html`, globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
