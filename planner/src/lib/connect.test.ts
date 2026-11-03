import { describe, expect, it, vi } from 'vitest'
import { approveFlow, connectFlow, flowInfo, withoutConnect } from './connect'

const FLOW = 'lt_fl_abcdefghijklmnopqrstuvwxyz012345'

describe('connectFlow', () => {
  it('reads a flow the connector handed out', () => {
    expect(connectFlow(`?connect=${FLOW}`)).toBe(FLOW)
    expect(connectFlow(`?v=2&connect=${FLOW}`)).toBe(FLOW)
  })

  it('ignores anything else', () => {
    expect(connectFlow('')).toBeNull()
    expect(connectFlow('?connect=')).toBeNull()
    expect(connectFlow('?connect=<script>')).toBeNull()
    expect(connectFlow('?connect=lt_at_abcdefghijklmnopqrstuvwxyz')).toBeNull()
  })
})

describe('withoutConnect', () => {
  it('drops only the flow', () => {
    expect(withoutConnect(`https://x.test/?trip=a&connect=${FLOW}#m`)).toBe('/?trip=a#m')
    expect(withoutConnect(`https://x.test/?connect=${FLOW}`)).toBe('/')
  })
})

describe('the connector calls', () => {
  it('gives who is asking, and null for a flow that ran out', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ client: 'ChatGPT', host: 'chatgpt.com' })))
    expect(await flowInfo(FLOW, ok as unknown as typeof fetch)).toEqual({ client: 'ChatGPT', host: 'chatgpt.com' })
    expect(String((ok.mock.calls[0] as unknown[])[0])).toContain(`/signin/flow?flow=${FLOW}`)
    const gone = vi.fn(async () => new Response('{"error":"gone"}', { status: 404 }))
    expect(await flowInfo(FLOW, gone as unknown as typeof fetch)).toBeNull()
  })

  it('posts the flow with the session token and reads the answer', async () => {
    const f = vi.fn(async () => new Response('{"ok":true}'))
    expect(await approveFlow(FLOW, 'tok', f as unknown as typeof fetch)).toBe(true)
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/signin\/approve$/)
    expect(JSON.parse(String(init.body))).toEqual({ flow: FLOW, access_token: 'tok' })
    const no = vi.fn(async () => new Response('{"ok":false}'))
    expect(await approveFlow(FLOW, 'tok', no as unknown as typeof fetch)).toBe(false)
  })
})
