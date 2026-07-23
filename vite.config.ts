import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Release 1: cache the application shell only. Financial data is never
      // cached for offline writes — see docs/02-product-philosophy.md §9.
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallbackDenylist: [/^\/api/],
      },
      manifest: {
        name: 'NIVA — Property Operating System',
        short_name: 'NIVA',
        description: 'Record income and expenses and understand how each property is performing.',
        theme_color: '#B5542A',
        background_color: '#FAF8F6',
        display: 'standalone',
        start_url: '/',
        icons: [
          // These previously pointed at pwa-192x192.png/pwa-512x512.png,
          // which never actually existed in public/ — the PWA install icon
          // was broken from Phase 1 until now (2026-07-23, branding pass).
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          // "maskable" lets Android crop this to a circle/squircle/etc.
          // without clipping the mark — needs its own safe-zone-padded
          // source image, not just a purpose flag on the regular icon.
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
