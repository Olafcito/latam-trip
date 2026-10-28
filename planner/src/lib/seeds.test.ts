import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseSeedFile } from '@map/data/trips'
import type { InOut } from '../data/types'
import { journeyToTrip, placesFromLegs } from './mapTrips'
import { schedule, totals } from './journey'
import { seedToJourney, seedWayId, withSeedWays } from './seeds'

// The ranked trips of the repo (data/saved_trips.json) as planner journeys. Skipped when the file is missing.
const file = resolve(import.meta.dirname, '../../../data/saved_trips.json')
const has = existsSync(file)

const empty: InOut = {
  generated_at: '', currency: 'DKK', home: ['CPH'], rating: { formula: '', price_anchor_dkk: 7000, price_basis: '', way_score: '' },
  airports: {}, tickets: {}, ways: {}, options: [],
}

describe.skipIf(!has)('seeded trips as journeys', () => {
  const seeds = has ? parseSeedFile(JSON.parse(readFileSync(file, 'utf8'))) : []
  const inout = withSeedWays(empty, seeds)

  it('keeps every seed with its own way in and way home', () => {
    expect(seeds.length).toBeGreaterThan(0)
    for (const s of seeds) {
      const j = seedToJourney(inout, s)!
      expect(inout.ways[j.wayIn]).toMatchObject({ id: seedWayId(s.id, 'in'), to: s.inout!.entry, direction: 'in' })
      expect(inout.ways[j.wayHome]).toMatchObject({ from: s.inout!.exit, direction: 'home' })
      expect(j.places[0].node).toBe(s.inout!.entry)
    }
  })

  it('follows the segments: overland blocks and priced flights in order', () => {
    const s = seeds.find((x) => x.id === 'seed-2-mga-ctg')!
    const j = seedToJourney(inout, s)!
    expect(j.places.map((p) => p.node)).toEqual(['MGA', 'SJO', 'LPB', 'CBB', 'VVI', 'BOG', 'CTG'])
    expect(j.places[1].hop?.overland).toBeTruthy()
    expect(j.places[2].hop).toMatchObject({ mode: 'flight', flight: { depart: expect.stringMatching(/^2026-12/) } })
    expect(j.places[6].hop?.overland).toBeTruthy()
  })

  it('fits the nights between the landing, the dated flights and the flight home', () => {
    for (const s of seeds) {
      const j = seedToJourney(inout, s)!
      const departs = j.places.flatMap((p) => (p.hop?.flight ? [p.hop.flight.depart] : []))
      // a seed whose flight prices were seen for dates out of order cannot fit; the builder warns about it
      if (departs.some((d, i) => i > 0 && d < departs[i - 1])) continue
      const sched = schedule(j, inout.ways[j.wayIn], inout.ways[j.wayHome], s.inout!.exit, (n) => n)
      expect(sched.slack, s.id).toBe(0)
      expect(sched.warnings.filter((w) => w.level === 'error'), s.id).toEqual([])
    }
  })

  it('counts the long-haul ticket and the seed flight prices in the totals', () => {
    const s = seeds[0]
    const j = seedToJourney(inout, s)!
    const t = totals({ inout, map: { nodes: [], edges: [] }, bags: [], trip: {}, source: 'local' }, j, null)
    expect(t.tickets_dkk).toBe(s.inout!.price_dkk)
    expect(t.regional_flights_dkk).toBeCloseTo(s.totals!.in_between_dkk, 0)
  })

  it('draws on the route map with its in/out and overland blocks, flights as legs', () => {
    const s = seeds.find((x) => x.id === 'seed-2-mga-ctg')!
    const t = journeyToTrip(seedToJourney(inout, s)!, 0, inout)
    expect(t.start).toBe('MGA')
    expect(t.legs.map((l) => `${l.from}>${l.to}`)).toEqual(['SJO>LPB', 'LPB>CBB', 'CBB>VVI', 'VVI>BOG'])
    expect(t.segments?.map((g) => g.kind)).toEqual(['overland', 'flight', 'flight', 'flight', 'flight', 'overland'])
    expect(t.inout).toMatchObject({ entry: 'MGA', exit: 'CTG', price_dkk: s.inout!.price_dkk })
    expect(t.inout?.way_in.timeline.length).toBeGreaterThan(0)
  })

  it('keeps the overland blocks when a leg is removed or added on the map', () => {
    const s = seeds.find((x) => x.id === 'seed-2-mga-ctg')!
    const j = seedToJourney(inout, s)!
    const map = { nodes: [], edges: [] }
    const legs = journeyToTrip(j).legs
    const dropped = placesFromLegs(j, legs.filter((_, i) => i !== 3), map)
    expect(dropped.map((p) => p.node)).toEqual(['MGA', 'SJO', 'LPB', 'CBB', 'VVI', 'CTG'])
    expect(dropped[5].hop).toMatchObject({ from: 'VVI', overland: expect.any(String) })
    const added = placesFromLegs(j, [...legs, { cid: 'CTG-SMR', from: 'CTG', to: 'SMR', mode: 'bus' }], map)
    expect(added.map((p) => p.node)).toEqual(['MGA', 'SJO', 'LPB', 'CBB', 'VVI', 'BOG', 'CTG', 'SMR'])
    expect(added[6].hop?.overland).toBeTruthy()
  })
})
