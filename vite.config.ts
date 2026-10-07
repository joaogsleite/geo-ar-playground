import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// Remote testing always goes through `npm run tunnel` (Cloudflare tunnel),
// which terminates public HTTPS — so the local server stays plain HTTP.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'GeoAR Playground',
        short_name: 'GeoAR',
        description:
          'Author scenes on a 2D map, preview them anchored in the real world.',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    // The tunnel subdomain is random on every run, so allow them all.
    // Scoped to trycloudflare.com — no other foreign Host is accepted.
    allowedHosts: ['.trycloudflare.com'],
  },
})
