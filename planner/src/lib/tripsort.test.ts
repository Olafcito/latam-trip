import { describe, expect, it } from 'vitest'
import { lowest, sortTrips, type SortRow } from './tripsort'
import { monthMarks, weekMarks } from './timeaxis'

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

  it('puts seeded trips by rank first, then saved ones by save time, then the draft', () => {
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

describe('the month axis', () => {
  const d0 = Date.UTC(2026, 11, 1) // 1 Dec
  const d1 = Date.UTC(2027, 1, 5) // 5 Feb

  it('names each month where it starts', () => {
    const m = monthMarks([d0, d1])
    expect(m.map((x) => x.label)).toEqual(['Dec', 'Jan', 'Feb'])
    expect(m[0].f).toBe(0)
    expect(m[1].f).toBeCloseTo(31 / 66)
  })

  it('names the month a domain starts in, unless the next one starts right after', () => {
    expect(monthMarks([Date.UTC(2026, 11, 10), d1]).map((x) => x.label)).toEqual(['Dec', 'Jan', 'Feb'])
    expect(monthMarks([Date.UTC(2026, 10, 29), d1]).map((x) => x.label)).toEqual(['Dec', 'Jan', 'Feb'])
  })

  it('ticks every Monday', () => {
    const w = weekMarks([d0, d1])
    expect(w.length).toBe(9) // 7 Dec to 1 Feb
    for (const f of w) expect(new Date(d0 + f * (d1 - d0)).getUTCDay()).toBe(1)
  })
})
