// The repo and the web bucket are public. Lodgings and bookings are owner only rows (PROD-005),
// so nothing in web/src may import them or query them.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '..')

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name)
    if (e.isDirectory()) return sources(full)
    return /\.(ts|tsx)$/.test(e.name) && e.name !== 'privacy.test.ts' ? [full] : []
  })
}

describe('the public map carries no private rows', () => {
  const files = sources(SRC)

  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('imports nothing from a lodgings or bookings path', () => {
    const bad = files.filter((f) => /(?:from\s+|import\()\s*['"][^'"]*(lodgings|bookings)[^'"]*['"]/.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })

  it('queries neither table', () => {
    const bad = files.filter((f) => /from\(\s*['"](lodgings|bookings)['"]\s*\)/.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })

  it('imports nothing from the planner', () => {
    const bad = files.filter((f) => /from\s+['"][^'"]*planner\/src/.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})
