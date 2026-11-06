import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CAP_SAID, invokeRead } from './readFiles'

// Nothing here reaches the read function.
const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }))

const said = (status: number, error: string) => ({ data: null, error: { context: new Response(JSON.stringify({ error }), { status }) } })

describe('invokeRead', () => {
  beforeEach(() => invoke.mockReset())

  it('gives the plain sentence for the monthly cap, never the code', async () => {
    invoke.mockResolvedValue(said(429, 'monthly_cap'))
    expect(await invokeRead({ text: 'TEST01' })).toEqual({ ok: false, message: CAP_SAID })
  })

  it('passes on what the function said otherwise', async () => {
    invoke.mockResolvedValue(said(401, 'Sign in to read bookings.'))
    expect(await invokeRead({ text: 'TEST01' })).toEqual({ ok: false, message: 'Sign in to read bookings.' })
  })
})
