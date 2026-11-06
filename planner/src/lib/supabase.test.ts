import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
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

describe('linkOutcome', () => {
  it('is sent when Supabase answers with no error', async () => {
    expect((await load()).linkOutcome(null)).toEqual({ s: 'sent' })
  })

  it('reads the hook refusal and a closed sign up as the invite state', async () => {
    const { linkOutcome } = await load()
    expect(linkOutcome({ status: 403, code: 'unknown', message: 'Sign up is by invite only' })).toEqual({ s: 'invite' })
    expect(linkOutcome({ status: 422, code: 'otp_disabled', message: 'Signups not allowed for otp' })).toEqual({ s: 'invite' })
    expect(linkOutcome({ status: 422, code: 'signup_disabled', message: 'Signups not allowed for this instance' })).toEqual({ s: 'invite' })
  })

  it('keeps another 403 an error, so a refused key never reads as a missing invite', async () => {
    expect((await load()).linkOutcome({ status: 403, message: 'Invalid API key' })).toEqual({ s: 'error', message: 'Could not send the link' })
  })

  it('names a rate limit and a lost connection, and shows no raw message', async () => {
    const { linkOutcome } = await load()
    expect(linkOutcome({ status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }))
      .toEqual({ s: 'error', message: 'Too many links asked for, wait a minute' })
    expect(linkOutcome({ status: 0, message: 'Failed to fetch' })).toEqual({ s: 'error', message: 'Could not reach the sign in' })
    expect(linkOutcome({ status: 500, message: 'Error sending magic link email' })).toEqual({ s: 'error', message: 'Could not send the link' })
  })

  it('writes no question mark', async () => {
    const { linkOutcome } = await load()
    for (const e of [{ status: 429 }, { status: 0 }, { status: 500 }]) {
      const r = linkOutcome(e)
      expect(r.s === 'error' && r.message.includes('?')).toBe(false)
    }
  })
})

describe('sendMagicLink', () => {
  it('lets a new address through to the invite hook', async () => {
    vi.stubGlobal('window', { location: { origin: 'https://x.test', pathname: '/', search: '' } })
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_KEY', 'sb_publishable_test')
    const m = await load()
    const spy = vi.spyOn(m.supabase!.auth, 'signInWithOtp').mockResolvedValue({ data: { user: null, session: null }, error: null })
    expect(await m.sendMagicLink('  test01@example.test ')).toEqual({ s: 'sent' })
    expect(spy).toHaveBeenCalledWith({ email: 'test01@example.test', options: { emailRedirectTo: 'https://x.test', shouldCreateUser: true } })
  })

  it('is an error, not a throw, when the call fails', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('VITE_SUPABASE_KEY', 'sb_publishable_test')
    const m = await load()
    vi.spyOn(m.supabase!.auth, 'signInWithOtp').mockRejectedValue(new Error('offline'))
    expect(await m.sendMagicLink('test01@example.test')).toEqual({ s: 'error', message: 'Could not reach the sign in' })
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

  it('keeps a consent request across the sign in and nothing else', async () => {
    const m = await load()
    expect(m.signInRedirect({ origin: 'https://x.test', pathname: '/', search: '?trip=a&authorization_id=abc123def' })).toBe('https://x.test/?authorization_id=abc123def')
    expect(m.signInRedirect({ origin: 'https://x.test', pathname: '/', search: '?trip=a' })).toBe('https://x.test')
  })
})
