import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

async function load() {
  vi.resetModules()
  return import('./supabase')
}

describe('remoteEnabled', () => {
  it('is off without the env values and gives no client', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_KEY', '')
    const m = await load()
    expect(m.remoteEnabled()).toBe(false)
    expect(m.supabase).toBeNull()
  })

  it('is off when only the url is set', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_KEY', '')
    expect((await load()).remoteEnabled()).toBe(false)
  })

  it('is on with both values and gives a client', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_KEY', 'sb_publishable_test')
    const m = await load()
    expect(m.remoteEnabled()).toBe(true)
    expect(m.supabase).not.toBeNull()
  })
})
