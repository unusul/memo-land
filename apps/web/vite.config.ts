import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

const proxyTarget = loadEnv('development', __dirname, '')['SUPABASE_PROXY_TARGET'];

export default defineConfig({
  root: __dirname,
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
        start_url: '/',
        theme_color: '#3b46c9',
        background_color: '#f3f4f8',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
        shortcuts: [{ name: 'Nuova bozza', short_name: 'Bozza', url: '/?capture=1', icons: [{ src: 'icon.svg', sizes: 'any' }] }],
      },
      workbox: { navigateFallback: '/index.html', globPatterns: ['**/*.{js,css,html,svg}'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
  },
});
