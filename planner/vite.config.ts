import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { normalize, resolve } from 'node:path'

// The Map tab is the route map from ../web, imported as @map. In dev it reads ../data/web
// straight from the repo, like the web app does.
const WEB_SRC = resolve(import.meta.dirname, '../web/src')
const DATA_DIR = resolve(import.meta.dirname, '../data')

function serveRepoData(): Plugin {
  return {
    name: 'serve-repo-data',
    configureServer(server) {
      server.middlewares.use('/data', (req, res, next) => {
        const path = normalize(resolve(DATA_DIR, '.' + decodeURIComponent((req.url ?? '/').split('?')[0])))
        if (!path.startsWith(DATA_DIR) || !existsSync(path) || !statSync(path).isFile()) return next()
        res.setHeader('Content-Type', path.endsWith('.json') ? 'application/json' : 'application/octet-stream')
        res.setHeader('Cache-Control', 'no-store')
        createReadStream(path).pipe(res)
      })
    },
  }
}

// base './' so the build works from any GitHub Pages sub path.
export default defineConfig({
  base: './',
  plugins: [react(), serveRepoData()],
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
