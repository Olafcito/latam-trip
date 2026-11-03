import { describe, expect, it } from 'vitest'
import type { InOut } from '../data/types'
import type { Totals } from './journey'
import { rowToJourney, withTripWays, type TripRow } from './repoTrips'
import { journeyToRow, tripRowErrors } from './tripRow'

const bare = { generated_at: '', currency: 'DKK', home: ['CPH'], airports: {}, tickets: {}, ways: {}, options: [] } as unknown as InOut
const zero: Totals = {
  tickets_dkk: 1, regional_flights_dkk: 2, cabin_bag_dkk: null, checked_bag_dkk: null, hub_nights: 0, hub_stay_dkk: 0,
  ground_dkk: 3, ground_unknown: 0, stays_booked_dkk: 0, stays_planned_dkk: 0, stays_unknown: 0, flights: 4, air_hours: 5, days_per_country: { GT: 7 }, hub_stops: [],
}

/** What a version holds apart from when, by whom and which number it is, and the history trips.json adds. */
const content = (r: TripRow) => {
  const { version: _v, saved_at: _s, by: _b, history: _h, ...rest } = r
  return JSON.parse(JSON.stringify(rest))
}

const way = (from: string, to: string): TripRow['way_in'] => ({
  from, to, depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10', price_dkk: 3900,
  tickets: ['TQ:abc'], airports: [from, to],
  timeline: [{ kind: 'flight', from, to, depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10' }] as unknown as TripRow['way_in']['timeline'],
})
const sample: TripRow = {
  id: 'test-trip', version: 1, name: 'Test trip', saved_at: '2026-10-29T10:00:00Z', by: 'plan-trip',
  why: 'synthetic fixture', rank: 1, option_id: 'GUA-BOG-ticket',
  way_in: way('CPH', 'GUA'), way_home: way('BOG', 'CPH'),
  tickets: { 'TQ:abc': { id: 'TQ:abc', price_dkk: 7850, observed_at: '2026-10-28T17:18:27Z' } },
  places: [
    { node: 'GUA', hop: null, why: 'the way in lands here' },
    { node: 'BOG', hop: { from: 'GUA', to: 'BOG', mode: 'flight', operator: null, hours: 3, price_dkk: 1200,
      overnight: false, border: true, flight: null, observed_at: '2026-10-28T16:55:00Z', date: '2026-12-05' } },
  ],
}
const rows = [sample]

describe('stored trips', () => {
  const io = withTripWays(bare, rows)

  it('opening and saving every stored trip makes the same content', () => {
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      const next = journeyToRow(rowToJourney(r), r, io, zero)
      expect(content(next), r.id).toEqual(content(r))
      expect(next.version).toBe(r.version + 1)
      expect(next.by).toBe('planner')
    }
  })

  it('keeps rank, why, option_id from the last row', () => {
    for (const r of rows) {
      const j = { ...rowToJourney(r), name: 'Renamed' }
      const next = journeyToRow(j, r, io, zero)
      expect(next.why).toBe(r.why)
      expect(next.rank).toEqual(r.rank)
      expect(next.option_id).toEqual(r.option_id)
      expect(next.name).toBe('Renamed')
      expect(next.totals).toEqual(zero)
    }
  })

  it('inlines way_in, way_home and tickets', () => {
    for (const r of rows) {
      const next = journeyToRow({ ...rowToJourney(r), name: 'Renamed' }, r, io, zero)
      expect(next.way_in).toEqual(r.way_in)
      expect(next.way_home).toEqual(r.way_home)
      expect(Object.keys(next.tickets ?? {}).sort()).toEqual([...new Set([...(r.way_in.tickets ?? []), ...(r.way_home.tickets ?? [])])].sort())
    }
  })

  it('inlines the ways of a journey that is not the trip\'s own, without the build id', () => {
    const r = rows[0]
    const w = { ...r.way_in, id: 'W9999' }
    const inout = { ...io, ways: { ...io.ways, W9999: w }, tickets: { ...io.tickets } } as unknown as InOut
    const next = journeyToRow({ ...rowToJourney(r), id: 'fresh', wayIn: 'W9999' }, null, inout, zero)
    expect(next.way_in).not.toHaveProperty('id')
    expect(next.way_in.tickets).toEqual(r.way_in.tickets)
    expect(next.version).toBe(1)
    expect(next.rank).toBe(r.rank)
    expect(tripRowErrors(next)).toEqual([])
  })

  it("takes the option id of the journey once its ways are not the last row's", () => {
    const r = rows[0]
    const inout = { ...io, ways: { ...io.ways, W9999: { ...r.way_in, id: 'W9999' } } } as unknown as InOut
    expect(journeyToRow({ ...rowToJourney(r), wayIn: 'W9999', optionId: 'GUA-BOG-ticket-1203' }, r, inout, zero).option_id).toBe('GUA-BOG-ticket-1203')
    expect(journeyToRow({ ...rowToJourney(r), wayIn: 'W9999', optionId: null }, r, inout, zero).option_id).toBeNull()
  })

  it('a stop put in front keeps the nights, days and stay of the stops after it', () => {
    const stay = { name: 'Hostel', price_dkk: 300 }
    const r: TripRow = { ...rows[0], places: [
      { ...rows[0].places[0], nights: 3, arrive: '2026-12-02', depart: '2026-12-05', stay },
      { ...rows[0].places[1], nights: 4, stay },
    ] }
    const j = rowToJourney(r)
    const hop = { from: 'SJO', to: 'GUA', mode: 'bus' as const, operator: null, hours: 8, price_dkk: 400, overnight: false, border: true, flight: null }
    const { why: _, ...moved } = j.places[0]
    const front = { ...j, places: [{ node: 'SJO', hop: null }, { ...moved, hop }, j.places[1]] }
    const next = journeyToRow(front, r, io, zero)
    expect(next.places.map((p) => [p.node, p.nights, p.stay])).toEqual([['SJO', undefined, undefined], ['GUA', 3, stay], ['BOG', 4, stay]])
    expect([next.places[1].arrive, next.places[1].depart]).toEqual(['2026-12-02', '2026-12-05'])
    // the moved first stop does not get back the why that said the way in lands there
    expect(next.places[1].why).toBeUndefined()
  })

  it('keeps parked and the day of each hop', () => {
    const r = rows.find((x) => x.places.some((p) => p.hop && 'date' in p.hop))!
    const j = rowToJourney(r)
    const i = j.places.findIndex((p) => p.hop?.date)
    const parked = { quote_id: 'q', depart: '2026-12-20T22:10', arrive: '2026-12-21T05:05', hours: 6.9, price_dkk: 1234, carriers: ['X'], via: [], layover_h: [], source: 's', observed_at: null }
    j.places[i] = { ...j.places[i], hop: { ...j.places[i].hop!, parked } }
    const next = journeyToRow(j, r, io, zero)
    expect(next.places[i].hop).toMatchObject({ date: j.places[i].hop!.date, parked })
  })

  it('keeps lastNights', () => {
    const r = rows[0]
    const j = { ...rowToJourney(r), lastNights: 9 }
    expect(journeyToRow(j, r, io, zero).lastNights).toBe(9)
    const again = journeyToRow(rowToJourney({ ...r, lastNights: 9 }), { ...r, lastNights: 9 }, io, zero)
    expect(again.lastNights).toBe(9)
  })

  it('sets by to planner and passes the check', () => {
    for (const r of rows) {
      expect(tripRowErrors(journeyToRow(rowToJourney(r), r, io, zero))).toEqual([])
      expect(tripRowErrors(r)).toEqual([])
    }
  })

  it('refuses what tripdb check refuses', () => {
    const r = rows[0]
    const ok = journeyToRow(rowToJourney(r), r, io, zero)
    const bad = (over: Partial<TripRow>) => tripRowErrors({ ...ok, ...over } as TripRow)
    expect(bad({ by: 'someone' })).toEqual(['by is "someone", expected enum:plan-trip,migration,planner'])
    const { name: _n, ...noName } = ok
    expect(tripRowErrors(noName as TripRow)).toContain('missing name')
    expect(bad({ id: 'a b' })[0]).toMatch(/^id is "a b", expected tid/)
    expect(bad({ version: 0 })).toContain('version 0 is below 1')
    expect(bad({ places: [] })).toContain('places is empty')
    expect(bad({ way_in: { ...ok.way_in, from: 'cph' } })[0]).toMatch(/^way_in from is "cph", expected iata/)
    expect(bad({ tickets: { T1: { id: 'T1' } as never } })).toContain('tickets.T1 missing price_dkk')
    const places = ok.places.map((p) => ({ ...p }))
    expect(bad({ places: [{ ...places[0], hop: places[1].hop }, ...places.slice(1)] })).toContain('places[0] has a hop, the first place is where the way in lands')
    expect(bad({ places: [places[0], { ...places[1], hop: null }] })).toContain(`places[1] ${places[1].node} has no hop`)
    expect(bad({ places: [places[0], { ...places[1], hop: { ...places[1].hop!, to: 'ZZZ' } }] }).join()).toMatch(/places\[1\]\.hop ends in ZZZ/)
    expect(bad({ places: [places[0], { ...places[1], hop: { ...places[1].hop!, mode: 'rocket' as never } }] }).join()).toMatch(/places\[1\]\.hop mode is "rocket"/)
    const stays = (s: unknown[]) => bad({ places: [places[0], { ...places[1], stays: s as never }] })
    expect(stays([{ lodging_id: 'L1', room_id: null }, { lodging_id: 'L2', room_id: 'R2', nights: 2 }])).toEqual([])
    expect(stays([{ lodging_id: 'L1', room_id: 'R1', nights: 0 }])).toEqual(['places[1].stays[0] nights is below 1'])
    expect(stays([{ room_id: 'R1' }])).toEqual(['places[1].stays[0] missing lodging_id'])
    expect(stays(['L1'])).toEqual(['places[1].stays[0] is not a JSON object'])
  })
})
