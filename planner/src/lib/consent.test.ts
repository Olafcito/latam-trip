import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { answerConsent, consentId, consentStep, hostAllowed, readConsent, withoutConsent } from './consent'

const ID = 'TEST01abcdefgh'
const ASK = {
  authorization_id: ID,
  redirect_uri: 'https://claude.ai/api/mcp/auth_callback',
  client: { client_id: 'c1', client_name: 'Claude' },
  user: { id: 'u1', email: 'test@example.test' },
  scope: 'email',
}

const answer = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }))
const as = (f: unknown) => f as typeof fetch

beforeEach(() => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.test/')
  vi.stubEnv('VITE_SUPABASE_KEY', 'sb_publishable_test')
})
afterEach(() => vi.unstubAllEnvs())

describe('consentId', () => {
  it('reads the authorization Supabase sends', () => {
    expect(consentId(`?authorization_id=${ID}`)).toBe(ID)
    expect(consentId(`?trip=a&authorization_id=${ID}`)).toBe(ID)
  })

  it('ignores anything else', () => {
    expect(consentId('')).toBeNull()
    expect(consentId('?authorization_id=')).toBeNull()
    expect(consentId('?authorization_id=<script>')).toBeNull()
    expect(consentId('?connect=lt_fl_abcdefghijkl')).toBeNull()
  })
})

describe('withoutConsent', () => {
  it('drops only the authorization', () => {
    expect(withoutConsent(`https://x.test/?trip=a&authorization_id=${ID}#m`)).toBe('/?trip=a#m')
    expect(withoutConsent(`https://x.test/?authorization_id=${ID}`)).toBe('/')
  })
})

describe('hostAllowed', () => {
  it('lets a code go to Claude, ChatGPT and a local client', () => {
    expect(hostAllowed('https://claude.ai/api/mcp/auth_callback')).toBe(true)
    expect(hostAllowed('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(true)
    expect(hostAllowed('http://localhost:33418/callback')).toBe(true)
    expect(hostAllowed('http://127.0.0.1:5000/cb')).toBe(true)
  })

  it('refuses every other host, plain http to Claude and a look alike', () => {
    expect(hostAllowed('https://attacker.example/cb')).toBe(false)
    expect(hostAllowed('http://claude.ai/cb')).toBe(false)
    expect(hostAllowed('https://claude.ai.attacker.example/cb')).toBe(false)
    expect(hostAllowed('https://evil.claude.ai/cb')).toBe(false)
    expect(hostAllowed('https://user:pw@claude.ai/cb')).toBe(false)
    expect(hostAllowed('http://chatgpt.com/connector_platform_oauth_redirect')).toBe(false)
    expect(hostAllowed('https://chatgpt.com.attacker.example/cb')).toBe(false)
    expect(hostAllowed('https://chatgpt.com/aip/g-x/oauth/callback')).toBe(false)
    expect(hostAllowed('https://chatgpt.com/connector_platform_oauth_redirect/x')).toBe(false)
    expect(hostAllowed('https://user:pw@chatgpt.com/connector_platform_oauth_redirect')).toBe(false)
    expect(hostAllowed('https://chat.openai.com/cb')).toBe(false)
    expect(hostAllowed('not an address')).toBe(false)
  })
})

describe('consentStep', () => {
  it('asks with the client, the host and the scope', () => {
    expect(consentStep(ID, ASK)).toEqual({ s: 'ask', ask: { id: ID, client: 'Claude', host: 'claude.ai', scopes: ['email'], email: 'test@example.test' } })
  })

  it('refuses an unknown redirect host, whatever the client calls itself', () => {
    expect(consentStep(ID, { ...ASK, redirect_uri: 'https://attacker.example/cb' })).toEqual({ s: 'refused', host: 'attacker.example', client: 'Claude' })
  })

  it('follows an already approved redirect at once', () => {
    const url = 'https://claude.ai/api/mcp/auth_callback?code=TEST01&state=s'
    expect(consentStep(ID, { redirect_url: url })).toEqual({ s: 'follow', url })
  })

  it('never follows an approved redirect to an unknown host', () => {
    expect(consentStep(ID, { redirect_url: 'https://attacker.example/cb?code=TEST01' })).toEqual({ s: 'refused', host: 'attacker.example', client: null })
  })

  it('names the host when the client has no name', () => {
    const step = consentStep(ID, { ...ASK, client: { client_id: 'c1' } })
    expect(step.s === 'ask' && step.ask.client).toBe('claude.ai')
  })
})

describe('the Supabase calls', () => {
  it('reads the authorization with the publishable key and the session', async () => {
    const f = answer(200, ASK)
    expect((await readConsent(ID, 'tok', as(f))).s).toBe('ask')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`https://proj.test/auth/v1/oauth/authorizations/${ID}`)
    expect(init.headers).toMatchObject({ apikey: 'sb_publishable_test', Authorization: 'Bearer tok' })
  })

  it('gives gone for a request that ran out and throws on a failure', async () => {
    expect(await readConsent(ID, 'tok', as(answer(404, {})))).toEqual({ s: 'gone' })
    await expect(readConsent(ID, 'tok', as(answer(500, {})))).rejects.toThrow()
  })

  it('answers allow and deny and goes on to the answer', async () => {
    const url = 'https://claude.ai/api/mcp/auth_callback?code=TEST01&state=s'
    const f = answer(200, { redirect_url: url })
    expect(await answerConsent(ID, 'tok', 'approve', as(f))).toBe(url)
    const [to, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(to).toBe(`https://proj.test/auth/v1/oauth/authorizations/${ID}/consent`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({ action: 'approve' })
    const deny = answer(200, { redirect_url: 'https://claude.ai/api/mcp/auth_callback?error=access_denied&state=s' })
    expect(await answerConsent(ID, 'tok', 'deny', as(deny))).toContain('access_denied')
  })

  it('never goes on to a host the page did not allow', async () => {
    await expect(answerConsent(ID, 'tok', 'approve', as(answer(200, { redirect_url: 'https://attacker.example/cb' })))).rejects.toThrow()
  })
})
