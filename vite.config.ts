import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { readFileSync } from 'node:fs'

// Zet HTTPS=true (script "dev:telefoon") om met een zelfondertekend
// certificaat te draaien, zodat de microfoon op je telefoon werkt.
const useHttps = process.env.HTTPS === 'true'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// Voor lokale ontwikkeling: /api proxyen naar de productie-backend.
// Login komt uit het (gnegitignorede) bestand .dev-auth ("gebruiker:wachtwoord").
// Zet API_TARGET in je omgeving naar je eigen backend-URL.
const API_TARGET = process.env.API_TARGET || 'http://localhost:3017'
let devAuth = process.env.API_AUTH || ''
try {
  if (!devAuth) devAuth = readFileSync('.dev-auth', 'utf8').trim()
} catch {
  /* geen lokaal auth-bestand */
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  plugins: [
    react(),
    useHttps && basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Kindfolio',
        short_name: 'Kindfolio',
        description: 'Thuisonderwijs portfolio: logboek en voortgang per kind',
        lang: 'nl',
        theme_color: '#2f6f4f',
        background_color: '#f7f5ef',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        navigateFallback: '/index.html',
        // API-verzoeken nooit door de service worker afhandelen.
        navigateFallbackDenylist: [/^\/api/],
        // Nieuwe versie meteen activeren i.p.v. blijven hangen op een oude.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: API_TARGET,
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          if (devAuth) {
            const header =
              'Basic ' + Buffer.from(devAuth).toString('base64')
            proxy.on('proxyReq', (proxyReq) => {
              proxyReq.setHeader('Authorization', header)
            })
          }
          // Lokaal (http://localhost) kan een Secure-cookie niet bewaard worden;
          // strip het vlaggetje zodat de cookie-login ook in dev werkt.
          proxy.on('proxyRes', (proxyRes) => {
            const sc = proxyRes.headers['set-cookie']
            if (sc) {
              proxyRes.headers['set-cookie'] = sc.map((c) =>
                c.replace(/;\s*Secure/gi, ''),
              )
            }
          })
        },
      },
    },
  },
})
