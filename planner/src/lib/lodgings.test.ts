import { beforeEach, describe, expect, it, vi } from 'vitest'

const log: { table: string; change: unknown; id: unknown }[] = []
let found = true
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      update: (change: unknown) => ({
        eq: (_k: string, id: unknown) => ({
          select: async () => {
            log.push({ table, change, id })
            return { data: found ? [{ id }] : [], error: null }
          },
        }),
      }),
    }),
  },
}))

import { setLodgingAddress } from './lodgings'

beforeEach(() => {
  log.length = 0
  found = true
})

describe('setLodgingAddress', () => {
  it('writes the trimmed address to the place', async () => {
    expect(await setLodgingAddress('l1', '  Calle 5 no 3 ')).toEqual({ ok: true })
    expect(log).toEqual([{ table: 'lodgings', change: { address: 'Calle 5 no 3' }, id: 'l1' }])
  })

  it('writes nothing empty and says when the place is gone', async () => {
    expect((await setLodgingAddress('l1', ' ')).ok).toBe(false)
    expect(log).toHaveLength(0)
    found = false
    expect(await setLodgingAddress('l1', 'Calle 5')).toEqual({ ok: false, message: 'The place is not there any more.' })
  })
})
