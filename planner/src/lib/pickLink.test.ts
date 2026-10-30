import { describe, expect, it } from 'vitest'
import type { MapData } from '../data/types'
import type { Hop, Journey } from './journey'
import { pickedLeg, readPick, withoutPick } from './pickLink'

const good = {
  from: 'VVI', to: 'CBB', dep: '2026-12-15T05:35', arr: '2026-12-15T06:20', hours: 0.75, stops: 0, via: [], layover_h: [],
  carriers: ['BoA'], overnight: false, price: 441, site: 'BoA', seen: '2026-10-30T15:00:00Z', self_transfer: false, airport_change: false,
  fare_brand: 'Economy', cabin_bag: null, checked_bag: null,
}
const link = (v: unknown) => `?trip=t&pick=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`

describe('reading a pick from the address', () => {
  it('is nothing without one', () => {
    expect(readPick('?trip=t')).toBeNull()
  })

  it('reads a flight in the shape of a picked flight', () => {
    const p = readPick(link(good))
    if (!p || p === 'bad') throw new Error('not read')
    expect(p.from).toBe('VVI')
    expect(p.flight).toMatchObject({ depart: '2026-12-15T05:35', arrive: '2026-12-15T06:20', hours: 0.75, price_dkk: 441, stops: 0, carriers: ['BoA'], source: 'momondo-manual', site: 'BoA' })
  })

  it('refuses what is not a flight', () => {
    for (const v of [
      'not json', 'null', '[]', '{}',
      { ...good, from: 'vvi' },
      { ...good, to: 'CBBX' },
      { ...good, dep: '2026-12-15' },
      { ...good, arr: '2026-13-45T99:00' },
      { ...good, price: 0 },
      { ...good, price: '441' },
      { ...good, price: 1e9 },
      { ...good, hours: -1 },
      { ...good, stops: 1.5e3 },
      { ...good, carriers: [] },
      { ...good, carriers: [1] },
      { ...good, carriers: ['x'.repeat(200)] },
      { ...good, via: ['nowhere'] },
      { ...good, layover_h: ['long'] },
    ]) expect(readPick(link(v))).toBe('bad')
  })

  it('drops an optional field it cannot trust and keeps the flight', () => {
    const p = readPick(link({ ...good, site: { a: 1 }, seen: 7 }))
    if (!p || p === 'bad') throw new Error('not read')
    expect(p.flight.site).toBeNull()
    expect(p.flight.observed_at).toBeNull()
  })
})

describe('the address after a pick', () => {
  it('keeps the trip and loses the pick', () => {
    expect(withoutPick('http://localhost:5198/?trip=t&pick=%7B%7D#x')).toBe('/?trip=t#x')
  })
})

describe('the leg a pick goes to', () => {
  const map = { nodes: [{ id: 'SCZ', iata: 'VVI' }, { id: 'CBB', iata: 'CBB' }, { id: 'LPB', iata: 'LPB' }], edges: [] } as unknown as MapData
  const hop = (from: string, to: string, date?: string) => ({ from, to, date, mode: 'flight', flight: null }) as unknown as Hop
  const trip = (...hops: Hop[]) => ({ places: [{ node: 'LPB', hop: null }, ...hops.map((h) => ({ node: h.to, hop: h }))] }) as unknown as Journey
  const pick = readPick(link(good))
  if (!pick || pick === 'bad') throw new Error('not read')

  it('finds the leg by its airports', () => {
    expect(pickedLeg(trip(hop('LPB', 'SCZ'), hop('SCZ', 'CBB')), map, pick)).toBe(2)
  })

  it('takes the leg on the same day when the route is flown twice', () => {
    expect(pickedLeg(trip(hop('SCZ', 'CBB', '2026-11-01'), hop('CBB', 'SCZ'), hop('SCZ', 'CBB', '2026-12-15')), map, pick)).toBe(3)
  })

  it('is -1 when the trip has no such leg', () => {
    expect(pickedLeg(trip(hop('CBB', 'SCZ')), map, pick)).toBe(-1)
  })
})
