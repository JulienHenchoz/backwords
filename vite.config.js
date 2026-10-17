import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { execSync } from 'node:child_process'

// Version affichée dans le pied de page : commit + date du build.
// Vercel fournit le commit en variable d'env (le dépôt cloné peut être superficiel).
function commitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short=7 HEAD').toString().trim()
  } catch {
    return 'dev'
  }
}

const buildDate = new Intl.DateTimeFormat('fr-CH', {
  timeZone: 'Europe/Zurich',
  dateStyle: 'short',
  timeStyle: 'short',
}).format(new Date())

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(`${commitSha()} · ${buildDate}`),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Backwords — le mot à l\'envers',
        short_name: 'Backwords',
        description: "Enregistre un mot, écoute-le à l'envers, devine-le : un party game audio à se passer de main en main.",
        theme_color: '#1b1b1f',
        background_color: '#1b1b1f',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Gestion des notifications push du mode en ligne.
        importScripts: ['push-handler.js'],
      },
    }),
  ],
})
