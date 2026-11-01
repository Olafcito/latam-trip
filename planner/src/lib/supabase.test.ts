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

describe('signInRedirect', () => {
  it.each([
    ['https://d15amu9hjiumbd.cloudfront.net', '/', 'https://d15amu9hjiumbd.cloudfront.net'],
    ['http://localhost:5198', '/', 'http://localhost:5198'],
    ['https://d15amu9hjiumbd.cloudfront.net', '/preview/', 'https://d15amu9hjiumbd.cloudfront.net/preview/'],
    ['https://d15amu9hjiumbd.cloudfront.net', '/preview/index.html', 'https://d15amu9hjiumbd.cloudfront.net/preview/index.html'],
  ])('%s%s comes back to itself', async (origin, pathname, want) => {
    const m = await load()
    expect(m.signInRedirect({ origin, pathname })).toBe(want)
  })
})
