import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
// Runtime data comes from the Supabase bucket cache, including in development.

export default defineConfig({
  base: './',
  plugins: [react()],
  // maplibre finds its worker next to its own module, which pre-bundling would move
  optimizeDeps: { exclude: ['maplibre-gl'] },
  test: { environment: 'node' },
})
