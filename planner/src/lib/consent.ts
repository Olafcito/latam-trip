/** The consent step of Supabase's OAuth server (TECH-010, FEAT-006 way 1).
 *
 * Supabase sends a person who connects an assistant to the planner with `?authorization_id=` on the address. The
 * planner signs them in if needed, reads who asks with the session's token and answers allow or deny. Supabase takes
 * any client name and any redirect address when a client registers itself, so the redirect host is what the page
 * checks and shows: only Claude, ChatGPT and a local client may receive a code. */

const ID = /^[A-Za-z0-9_-]{8,128}$/

/** The hosts an authorization may send a code back to. claude.ai and chatgpt.com only over https, a local client over either. */
const HOSTS: Record<string, readonly string[]> = {
  'claude.ai': ['https:'],
  'chatgpt.com': ['https:'],
  localhost: ['http:', 'https:'],
  '127.0.0.1': ['http:', 'https:'],
}

/** The authorization id on the address, or null. */
export function consentId(search: string): string | null {
  const id = new URLSearchParams(search).get('authorization_id')
  return id && ID.test(id) ? id : null
}

/** The address without the authorization id, everything else kept. */
export function withoutConsent(href: string): string {
  const u = new URL(href)
  u.searchParams.delete('authorization_id')
  return u.pathname + u.search + u.hash
}

/** The host a redirect address names, or null when it is no address. */
export function redirectHost(uri: string): string | null {
  try {
    return new URL(uri).hostname || null
  } catch {
    return null
  }
}

/** True when a code may go to this address. */
export function hostAllowed(uri: string): boolean {
  try {
    const u = new URL(uri)
    return (HOSTS[u.hostname] ?? []).includes(u.protocol) && !u.username && !u.password
  } catch {
    return false
  }
}

export type Ask = { id: string; client: string; host: string; scopes: string[]; email: string | null }

/** What the page does with an authorization. */
export type Step =
  | { s: 'ask'; ask: Ask }
  | { s: 'follow'; url: string }
  | { s: 'refused'; host: string | null; client: string | null }
  | { s: 'gone' }

type Fetch = typeof fetch

function env() {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '')
  const key = import.meta.env.VITE_SUPABASE_KEY as string | undefined
  if (!url || !key) throw new Error('Sign in is not set up')
  return { url, key }
}

function headers(key: string, token: string) {
  return { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
}

/** Reads the authorization and decides the step. An answer with only redirect_url means the person allowed this client
 * before, so the page follows it at once, as long as its host is allowed. */
export async function readConsent(id: string, token: string, fetcher: Fetch = fetch): Promise<Step> {
  const { url, key } = env()
  const r = await fetcher(`${url}/auth/v1/oauth/authorizations/${encodeURIComponent(id)}`, { headers: headers(key, token) })
  if (r.status === 400 || r.status === 404 || r.status === 410) return { s: 'gone' }
  if (!r.ok) throw new Error(`authorization ${r.status}`)
  return consentStep(id, await r.json())
}

/** The step for an authorization answer. Pure, so the refusals are tested without a network. */
export function consentStep(id: string, a: Record<string, unknown>): Step {
  const client = (a.client ?? {}) as Record<string, unknown>
  const name = String(client.client_name ?? client.name ?? '').trim() || null
  if (typeof a.redirect_url === 'string' && !a.redirect_uri) {
    return hostAllowed(a.redirect_url) ? { s: 'follow', url: a.redirect_url } : { s: 'refused', host: redirectHost(a.redirect_url), client: name }
  }
  if (typeof a.redirect_uri !== 'string') return { s: 'gone' }
  const host = redirectHost(a.redirect_uri)
  if (!hostAllowed(a.redirect_uri) || !host) return { s: 'refused', host, client: name }
  const user = (a.user ?? {}) as Record<string, unknown>
  const scopes = String(a.scope ?? '').split(/\s+/).filter(Boolean)
  return { s: 'ask', ask: { id, client: name ?? host, host, scopes, email: typeof user.email === 'string' ? user.email : null } }
}

/** Answers the authorization and gives the address to go on to, or null when it is gone. The answer's host is checked
 * again, so a code never leaves for a host the page did not show. */
export async function answerConsent(id: string, token: string, action: 'approve' | 'deny', fetcher: Fetch = fetch): Promise<string | null> {
  const { url, key } = env()
  const r = await fetcher(`${url}/auth/v1/oauth/authorizations/${encodeURIComponent(id)}/consent`, {
    method: 'POST',
    headers: headers(key, token),
    body: JSON.stringify({ action }),
  })
  if (r.status === 400 || r.status === 404 || r.status === 410) return null
  if (!r.ok) throw new Error(`consent ${r.status}`)
  const body = (await r.json()) as Record<string, unknown>
  const next = typeof body.redirect_url === 'string' ? body.redirect_url : typeof body.redirect_to === 'string' ? body.redirect_to : null
  if (!next || !hostAllowed(next)) throw new Error('consent answered no allowed address')
  return next
}
