import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// The Map tab is the route map from ../web, imported as @map. In dev it reads ../data/web
// straight from the repo, like the web app does.
const WEB_SRC = resolve(import.meta.dirname, '../web/src')

// base './' so the build works from any GitHub Pages sub path.
export default defineConfig({
  base: './',
  // The old ignored offline snapshot may exist in a developer checkout. Never ship public files.
  publicDir: false,
  plugins: [react()],
  // one React and one maplibre for both apps' code
  resolve: { alias: { '@map': WEB_SRC }, dedupe: ['react', 'react-dom', 'maplibre-gl'] },
  server: {
    fs: { allow: [resolve(import.meta.dirname, '..')] },
    // a rebase writes a file twice within ms. The watcher drops the second write, and the old code stays served until the next save
    watch: { awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 30 } },
  },
  // maplibre finds its worker next to its own module, which pre-bundling would move
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: { environment: 'node' },
})
