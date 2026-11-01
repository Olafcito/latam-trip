import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ownKey, readOwn } from './ownKey'

function fakeStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
})
afterEach(() => vi.unstubAllEnvs())

describe('ownKey', () => {
  it('is the key itself without Supabase', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_KEY', '')
    expect(ownKey('latam-planner.journeys')).toBe('latam-planner.journeys')
  })

  it('is a key of its own with Supabase', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_KEY', 'k')
    expect(ownKey('latam-planner.journeys')).toBe('latam-planner.journeys.sb')
  })
})

describe('readOwn', () => {
  it('reads the older key while the own key is empty, then the own key', () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
    vi.stubEnv('VITE_SUPABASE_KEY', 'k')
    localStorage.setItem('a', 'old')
    expect(readOwn('a')).toBe('old')
    localStorage.setItem('a.sb', 'new')
    expect(readOwn('a')).toBe('new')
    expect(localStorage.getItem('a')).toBe('old')
  })
})
