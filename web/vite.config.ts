import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { resolve, normalize } from 'node:path'

// In dev the app reads ../data/web/*.json straight from the repo, so a rerun of
// src/build_web_data.py shows up on reload. A production build reads VITE_DATA_BASE instead.
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

export default defineConfig({
  base: './',
  plugins: [react(), serveRepoData()],
  // maplibre finds its worker next to its own module, which pre-bundling would move
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: { environment: 'node' },
})
