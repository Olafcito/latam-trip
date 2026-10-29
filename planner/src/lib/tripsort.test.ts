import { describe, expect, it } from 'vitest'
import { lowest, sortTrips, type SortRow } from './tripsort'

const row = (id: string, over: Partial<SortRow> = {}): SortRow & { id: string } => ({ id, draft: false, total: null, air: null, ...over })
const ids = (rows: { id: string }[]) => rows.map((r) => r.id)

describe('sortTrips', () => {
  const rows = [
    row('mine-late', { savedAt: '2026-10-20', total: 9000, air: 30 }),
    row('draft', { draft: true, total: 7000, air: null }),
    row('seed-2', { rank: 2, total: 8000, air: 28 }),
    row('mine-early', { savedAt: '2026-10-01', total: null, air: 25 }),
    row('seed-1', { rank: 1, total: 8000, air: 40 }),
  ]

  it('puts ranked trips first, then saved ones by save time, then the draft', () => {
    expect(ids(sortTrips(rows, 'rank'))).toEqual(['seed-1', 'seed-2', 'mine-early', 'mine-late', 'draft'])
  })

  it('sorts by price with unknown totals last and ties in their old order', () => {
    expect(ids(sortTrips(rows, 'price'))).toEqual(['draft', 'seed-2', 'seed-1', 'mine-late', 'mine-early'])
  })

  it('sorts by air time with unknown hours last', () => {
    expect(ids(sortTrips(rows, 'air'))).toEqual(['mine-early', 'seed-2', 'mine-late', 'seed-1', 'draft'])
  })

  it('leaves the input alone', () => {
    const before = ids(rows)
    sortTrips(rows, 'price')
    expect(ids(rows)).toEqual(before)
  })
})

describe('lowest', () => {
  it('marks the lowest known value', () => {
    expect([...lowest([900, 700, null])]).toEqual([1])
  })
  it('marks every column that ties for lowest', () => {
    expect([...lowest([700, 700, 800])]).toEqual([0, 1])
  })
  it('marks nothing when the values are all the same or only one is known', () => {
    expect(lowest([5, 5, 5]).size).toBe(0)
    expect(lowest([5, null, null]).size).toBe(0)
    expect(lowest([]).size).toBe(0)
  })
})
