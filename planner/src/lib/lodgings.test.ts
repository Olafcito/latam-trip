import { beforeEach, describe, expect, it, vi } from 'vitest'

const log: { table: string; change: unknown; id: unknown }[] = []
const upserts: { table: string; rows: unknown; opts: unknown }[] = []
let found = true
vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => ({
      upsert: async (rows: unknown, opts: unknown) => {
        upserts.push({ table, rows, opts })
        return { error: null }
      },
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

import { saveLodging, setLodgingAddress } from './lodgings'

beforeEach(() => {
  log.length = 0
  upserts.length = 0
  found = true
})

describe('saveLodging', () => {
  it('names the owner among the conflict columns of the lodging, its rooms and their prices', async () => {
    const r = await saveLodging({
      place_id: 'TAM', name: 'Test Hostel', kind: 'hostel', tags: [], links: [], photos: [],
      rooms: [{ name: 'Dorm', prices: [{ check_in: '2026-12-09', check_out: '2026-12-14', total_dkk: 1240, site: 'hostelworld' }] }],
    } as unknown as Parameters<typeof saveLodging>[0])
    expect(r.ok).toBe(true)
    expect(upserts.map((u) => u.table)).toEqual(['lodgings', 'lodging_rooms', 'lodging_prices'])
    for (const u of upserts) expect(u.opts).toEqual({ onConflict: 'id,owner_id', ignoreDuplicates: true })
  })
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
