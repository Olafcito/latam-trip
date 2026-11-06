import { describe, expect, it } from 'vitest'
import { instant, itinerary, type ItinInput } from './itinerary'

// Made up dates only, the shape of a trip from Copenhagen to two stops and home.
const base: ItinInput = {
  wayIn: { depart: '2026-12-01T09:55', arrive: '2026-12-02T08:10' },
  wayHome: { depart: '2026-12-20T18:00', arrive: '2026-12-21T14:00' },
  stops: [
    { inDay: '2026-12-02', outDay: '2026-12-03' },
    { inDay: '2026-12-03', outDay: '2026-12-20' },
  ],
  hops: [null, { depart: '2026-12-03T10:00', arrive: '2026-12-03T12:30' }],
  open: null,
  free: 0,
}
const keys = (inp: ItinInput) => itinerary(inp).map((e) => e.key)

describe('itinerary', () => {
  it('runs from Copenhagen through each stop and its leg out to Copenhagen', () => {
    expect(keys(base)).toEqual(['cph0', 'in', 's0', 'h1', 's1', 'home', 'cph1'])
  })

  it('puts an open stop\'s stay right after the stop and before the leg that leaves it', () => {
    expect(keys({ ...base, open: 0 })).toEqual(['cph0', 'in', 's0', 'f0', 'h1', 's1', 'home', 'cph1'])
  })

  it('puts the last stop\'s fold before the free nights and the way home', () => {
    expect(keys({ ...base, open: 1, free: 2 })).toEqual(['cph0', 'in', 's0', 'h1', 's1', 'f1', 'free', 'home', 'cph1'])
  })

  it('runs forward in time', () => {
    const ats = itinerary({ ...base, open: 0, free: 1 }).map((e) => e.at)
    expect([...ats].sort()).toEqual(ats)
  })

  it('starts a stop when its leg lands', () => {
    const s1 = itinerary(base).find((e) => e.key === 's1')
    expect(s1?.at).toBe('2026-12-03T12:30')
  })

  it('keeps a leg after its stop when it leaves before you get there, the clash is a warning and not a new order', () => {
    // the leg out of the first stop leaves before the way in lands
    const clash = { ...base, open: 0, hops: [null, { depart: '2026-12-02T06:00', arrive: '2026-12-02T07:00' }] }
    expect(keys(clash)).toEqual(['cph0', 'in', 's0', 'f0', 'h1', 's1', 'home', 'cph1'])
    const ats = itinerary(clash).map((e) => e.at)
    expect([...ats].sort()).toEqual(ats)
  })

  it('keeps a leg with a bare day after the stop it leaves on that same day', () => {
    const passing = { ...base, hops: [null, { depart: '2026-12-02', arrive: null }] }
    expect(keys(passing)).toEqual(['cph0', 'in', 's0', 'h1', 's1', 'home', 'cph1'])
  })

  it('marks a stop reached by no leg of its own with its day', () => {
    expect(keys({ ...base, hops: [null, null] })).toEqual(['cph0', 'in', 's0', 'g1', 's1', 'home', 'cph1'])
  })

  it('reads a bare day as the start of that day', () => {
    expect(instant('2026-12-03')).toBe('2026-12-03T00:00')
    expect(instant('2026-12-03T06:05:00')).toBe('2026-12-03T06:05')
  })
})
