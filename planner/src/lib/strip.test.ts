import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSeedFile } from '@map/data/trips'
import type { AppData, Airport, InOut, MapData, Way } from '../data/types'
import type { Hop, Journey } from './journey'
import { seedToJourney, withSeedWays } from './seeds'
import { stripDomain, stripLayout, type StripLayout } from './strip'
import { toUtcMs } from './time'

const DAY = 86400000

// ---- a hand built trip: lands in Managua, buses north, flies on, goes home from Bogota

const airport = (name: string, country: string, utc_offset: number, home = false): Airport => ({
  name, country, lat: 0, lon: 0, region: null, utc_offset, home,
})

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'ticket', from: 'CPH', to: 'MGA', depart: '2026-12-03T06:00', arrive: '2026-12-03T20:00',
  total_hours: 20, flying_hours: 18, flights: 2, hub_nights: 0, changes: 1, us_transit: false, airports: [], tickets: [], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 }, score: 0, timeline: [], ...over,
})

const handInout: InOut = {
  generated_at: '', currency: 'DKK', home: ['CPH'], rating: { formula: '', price_anchor_dkk: 7000, price_basis: '', way_score: '' },
  airports: {
    CPH: airport('Copenhagen', 'DK', 1, true),
    MGA: { ...airport('Managua', 'NI', -6), map_node: 'MGA' },
    SAL: { ...airport('San Salvador', 'SV', -6), map_node: 'SAL' },
    BOG: { ...airport('Bogota', 'CO', -5), map_node: 'BOG' },
  },
  tickets: {},
  ways: {
    I1: way({}),
    H1: way({ id: 'H1', direction: 'home', from: 'BOG', to: 'CPH', depart: '2026-12-20T10:00', arrive: '2026-12-21T09:00' }),
  },
  options: [],
}

const handMap: MapData = {
  nodes: [
    { id: 'MGA', name: 'Managua', country: 'NI', lat: 0, lon: 0, type: 'city', iata: 'MGA', popularity: 1 },
    { id: 'leon', name: 'Leon', country: 'NI', lat: 0, lon: 0, type: 'town', iata: null, popularity: 1 },
    { id: 'tegucigalpa', name: 'Tegucigalpa', country: 'HN', lat: 0, lon: 0, type: 'city', iata: null, popularity: 1 },
    { id: 'SAL', name: 'San Salvador', country: 'SV', lat: 0, lon: 0, type: 'city', iata: 'SAL', popularity: 1 },
    { id: 'BOG', name: 'Bogota', country: 'CO', lat: 0, lon: 0, type: 'city', iata: 'BOG', popularity: 1 },
  ],
  edges: [],
}

const handData: AppData = { inout: handInout, map: handMap, bags: [], trip: {}, source: 'local', meta: null }

const bus = (from: string, to: string): Hop => ({ from, to, mode: 'bus', operator: null, hours: 4, price_dkk: 120, overnight: false, border: false, flight: null })
const fly = (from: string, to: string, depart: string, arrive: string): Hop => ({
  from, to, mode: 'flight', operator: 'Avianca', hours: 3, price_dkk: 900, overnight: false, border: false,
  flight: { quote_id: 'Q', depart, arrive, hours: 3, price_dkk: 900, carriers: ['Avianca'], via: [], layover_h: [] },
})

const journey = (places: Journey['places']): Journey => ({ id: 'j1', name: 'Hand built', wayIn: 'I1', wayHome: 'H1', optionId: null, places })

// no dated flight between the landing and the flight home: seventeen days shared by five stops
const undated = journey([
  { node: 'MGA', hop: null },
  { node: 'leon', hop: bus('MGA', 'leon') },
  { node: 'tegucigalpa', hop: bus('leon', 'tegucigalpa') },
  { node: 'SAL', hop: bus('tegucigalpa', 'SAL') },
  { node: 'BOG', hop: { ...bus('SAL', 'BOG'), mode: 'flight' } },
])

// one dated flight that lands at 04:10 local time
const dated = journey([
  { node: 'MGA', hop: null },
  { node: 'SAL', hop: bus('MGA', 'SAL') },
  { node: 'BOG', hop: fly('SAL', 'BOG', '2026-12-12T23:30', '2026-12-13T04:10') },
])

// more stops than days: some stops get no whole day of their own
const crowded = journey(['MGA', 'leon', 'tegucigalpa', 'SAL', 'leon', 'tegucigalpa', 'SAL', 'BOG'].map((node, i, a) => ({ node, hop: i ? bus(a[i - 1], node) : null })))
const crowdedData: AppData = {
  ...handData,
  inout: { ...handInout, ways: { ...handInout.ways, H1: { ...handInout.ways.H1, depart: '2026-12-06T07:00', arrive: '2026-12-07T09:00' } } },
}

// ---- the ranked trips of the repo, with the real airports when the build is there

const seedFile = resolve(import.meta.dirname, '../../../data/web/saved_trips.json')
const inoutFile = resolve(import.meta.dirname, '../../../data/web/inout.json')
const hasSeeds = existsSync(seedFile)
const seeds = hasSeeds ? parseSeedFile(JSON.parse(readFileSync(seedFile, 'utf8'))) : []
const airports: InOut['airports'] = existsSync(inoutFile) ? (JSON.parse(readFileSync(inoutFile, 'utf8')) as InOut).airports : {}
const seedInout = withSeedWays({ ...handInout, airports, ways: {} }, seeds)
const seedData: AppData = { ...handData, inout: seedInout, map: { nodes: [], edges: [] } }
const seedLayouts: [string, StripLayout][] = seeds.map((s) => [s.id, stripLayout(seedData, seedToJourney(seedInout, s)!)!])

const handLayouts: [string, StripLayout][] = [
  ['undated', stripLayout(handData, undated)!],
  ['dated', stripLayout(handData, dated)!],
  ['crowded', stripLayout(crowdedData, crowded)!],
]
const all = [...handLayouts, ...seedLayouts]

describe('stripLayout', () => {
  it('stays are in order and never negative', () => {
    if (hasSeeds) expect(seedLayouts.length).toBeGreaterThan(0)
    for (const [id, l] of all) {
      expect(l, id).not.toBeNull()
      l.stays.forEach((s, k) => {
        expect(s.end, `${id} ${s.node}`).toBeGreaterThanOrEqual(s.start)
        if (k) expect(s.start, `${id} ${s.node}`).toBeGreaterThanOrEqual(l.stays[k - 1].end)
      })
      expect(l.land, id).toBeGreaterThanOrEqual(l.departHome)
      expect(l.leave, id).toBeGreaterThanOrEqual(l.land)
      expect(l.backHome, id).toBeGreaterThanOrEqual(l.leave)
    }
  })

  it('a trip with no dated flights still gives every stop a width above zero', () => {
    for (const [id, l] of [handLayouts[0], handLayouts[2]]) {
      expect(l.stays.length, id).toBeGreaterThan(4)
      for (const s of l.stays) expect(s.end - s.start, `${id} ${s.node}`).toBeGreaterThan(0)
    }
  })

  it('the first stay starts at the landing and the last ends when the way home leaves', () => {
    for (const [id, l] of all) {
      expect(l.stays[0].start, id).toBe(l.land)
      expect(l.stays[l.stays.length - 1].end, id).toBe(l.leave)
    }
    const h = handLayouts[0][1]
    expect(h.land).toBe(toUtcMs('2026-12-03T20:00', -6))
    expect(h.leave).toBe(toUtcMs('2026-12-20T10:00', -5))
    expect(h.departHome).toBe(toUtcMs('2026-12-03T06:00', 1))
    expect(h.backHome).toBe(toUtcMs('2026-12-21T09:00', 1))
  })

  it('names each stay with its place, country and nights', () => {
    const l = handLayouts[0][1]
    expect(l.stays.map((s) => s.name)).toEqual(['Managua', 'Leon', 'Tegucigalpa', 'San Salvador', 'Bogota'])
    expect(l.stays.map((s) => s.country)).toEqual(['NI', 'NI', 'HN', 'SV', 'CO'])
    expect(l.stays.reduce((a, s) => a + s.nights, 0)).toBe(17)
  })

  it('a dated flight pins the stays around it and is a night hop when it lands from 22 to 5', () => {
    const l = handLayouts[1][1]
    expect(l.stays[1].end).toBe(toUtcMs('2026-12-12T23:30', -6))
    expect(l.stays[2].start).toBe(toUtcMs('2026-12-13T04:10', -5))
    const [ground, flight] = l.hops
    expect(ground).toMatchObject({ mode: 'bus', night: false, known: true })
    expect(flight).toMatchObject({ mode: 'flight', night: true, known: true, selfTransfer: false })
    expect(flight.at).toBeGreaterThan(l.stays[1].end)
    expect(flight.at).toBeLessThan(l.stays[2].start)
  })

  it('an undated flight is an unknown hop between its stays', () => {
    const l = handLayouts[0][1]
    const last = l.hops[l.hops.length - 1]
    expect(last).toMatchObject({ mode: 'flight', known: false })
    expect(last.at).toBe(l.stays[4].start)
  })

  it('a place with no airport of its own takes the clock of an airport in its country', () => {
    const data: AppData = {
      ...handData,
      inout: { ...handInout, airports: { ...handInout.airports, VVI: { ...airport('Santa Cruz', 'BO', -4), map_node: 'VVI' } } },
      map: { ...handMap, nodes: [...handMap.nodes, { id: 'cochabamba', name: 'Cochabamba', country: 'BO', lat: 0, lon: 0, type: 'city', iata: null, popularity: 1 }] },
    }
    const l = stripLayout(data, journey([
      { node: 'MGA', hop: null },
      { node: 'cochabamba', hop: fly('MGA', 'cochabamba', '2026-12-08T10:00', '2026-12-08T18:00') },
      { node: 'BOG', hop: fly('cochabamba', 'BOG', '2026-12-15T09:00', '2026-12-15T11:00') },
    ]))!
    expect(l.stays[1].start).toBe(toUtcMs('2026-12-08T18:00', -4))
    expect(l.stays[1].end).toBe(toUtcMs('2026-12-15T09:00', -4))
  })

  it('marks self transfers and night landings on the regional flights and the long-haul ways', () => {
    const selfFly = fly('SAL', 'BOG', '2026-12-12T10:00', '2026-12-12T14:00')
    Object.assign(selfFly.flight!, { self_transfer: true })
    const data: AppData = {
      ...handData,
      inout: {
        ...handInout,
        ways: {
          I1: way({ arrive: '2026-12-03T23:15', timeline: [{ kind: 'self_transfer', airport: 'MAD', arrive: '2026-12-03T08:00', depart: '2026-12-03T11:00', hours: 3, nights: 0, same_ticket: false, stay_estimate_dkk: null }] }),
          H1: handInout.ways.H1,
        },
      },
    }
    const l = stripLayout(data, journey([{ node: 'MGA', hop: null }, { node: 'SAL', hop: bus('MGA', 'SAL') }, { node: 'BOG', hop: selfFly }]))!
    expect(l.wayIn).toEqual({ night: true, selfTransfer: true })
    expect(l.wayHome).toEqual({ night: false, selfTransfer: false })
    expect(l.hops[1]).toMatchObject({ selfTransfer: true, night: false })
  })

  it('is null when a way is missing', () => {
    expect(stripLayout(handData, { ...undated, wayHome: 'nope' })).toBeNull()
  })
})

describe('stripDomain', () => {
  it('stripDomain pads two days each side', () => {
    const ls = handLayouts.map(([, l]) => l)
    const land = Math.min(...ls.map((l) => l.land))
    const leave = Math.max(...ls.map((l) => l.leave))
    expect(stripDomain(ls)).toEqual([land - 2 * DAY, leave + 2 * DAY])
    expect(stripDomain(ls, 0)).toEqual([land, leave])
  })
})
