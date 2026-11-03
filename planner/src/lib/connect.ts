// The connector's sign in emails the owner a link to the planner with ?connect=<flow>. Here the owner allows that flow
// with the planner's own Supabase session, and the connector's sign in page goes on to the assistant by itself.

const CONNECTOR = 'https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com'

/** The connector's base address. VITE_CONNECTOR_URL points a test build at another one. */
export function connectorBase(): string {
  return ((import.meta.env as Record<string, string | undefined>).VITE_CONNECTOR_URL || CONNECTOR).replace(/\/$/, '')
}

/** The flow id in the address, or null. Only ids the connector hands out are taken. */
export function connectFlow(search: string): string | null {
  const v = new URLSearchParams(search).get('connect')
  return v && /^lt_fl_[\w-]{16,64}$/.test(v) ? v : null
}

/** The address without ?connect=, so a reload does not ask again. */
export function withoutConnect(href: string): string {
  const u = new URL(href)
  u.searchParams.delete('connect')
  return u.pathname + u.search + u.hash
}

export interface FlowInfo {
  client: string
  host: string
}

/** Who is asking, or null when the flow ran out or never was. */
export async function flowInfo(flow: string, fetcher: typeof fetch = fetch): Promise<FlowInfo | null> {
  const r = await fetcher(`${connectorBase()}/signin/flow?flow=${encodeURIComponent(flow)}`, { cache: 'no-store' })
  return r.ok ? ((await r.json()) as FlowInfo) : null
}

/** Allow the flow. True when the connector took the session as the owner's. */
export async function approveFlow(flow: string, accessToken: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const r = await fetcher(`${connectorBase()}/signin/approve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ flow, access_token: accessToken }),
  })
  return r.ok && ((await r.json()) as { ok?: boolean }).ok === true
}
