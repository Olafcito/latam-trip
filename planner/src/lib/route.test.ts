import { describe, expect, it } from 'vitest'
import type { AppData, InOut, MapData, Way } from '../data/types'
import type { Hop, Journey } from './journey'
import { flightLegs, flyOn, routeLabel, tripRoute } from './route'

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'GUA', depart: '2026-12-02T09:55', arrive: '2026-12-03T06:00',
  total_hours: 26, flying_hours: 18, flights: 2, hub_nights: 0, changes: 1, us_transit: false, airports: ['CPH', 'GUA'],
  tickets: [], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})

const airport = (name: string, country: string, home = false) => ({ name, country, lat: 0, lon: 0, region: null, utc_offset: 0, home, map_node: home ? undefined : undefined })

const inout: InOut = {
  generated_at: '', currency: 'DKK', home: ['CPH'],
  rating: { formula: '', price_anchor_dkk: 7000, price_basis: '', way_score: '' },
  airports: { CPH: airport('Copenhagen', 'DK', true), GUA: airport('Guatemala City', 'GT'), LPB: airport('La Paz', 'BO') },
  tickets: {},
  ways: {
    I1: way({}),
    H1: way({ id: 'H1', direction: 'home', from: 'LPB', to: 'CPH', depart: '2027-02-02T18:00', arrive: '2027-02-03T20:00' }),
  },
  options: [],
}

const node = (id: string, name: string, country: string) => ({ id, name, country, lat: 0, lon: 0, type: 'city', iata: id, popularity: 1 })
const map: MapData = {
  nodes: [
    node('GUA', 'Guatemala City', 'GT'), node('SJO', 'San José', 'CR'), node('BOG', 'Bogotá', 'CO'),
    node('LPB', 'La Paz', 'BO'), node('CBB', 'Cochabamba', 'BO'),
  ],
  edges: [],
}
const data: AppData = { inout, map, bags: [], trip: {}, source: 'local', meta: null }

const hop = (from: string, to: string, over: Partial<Hop> = {}): Hop => ({
  from, to, mode: 'bus', operator: null, hours: null, price_dkk: null, overnight: false, border: false, flight: null, ...over,
})
const flight = (depart: string, arrive: string) => ({
  quote_id: '', depart, arrive, hours: 4, price_dkk: 900, carriers: [], via: [], layover_h: [], fare_brand: null, cabin_bag: null,
})

const journey = (over: Partial<Journey> = {}): Journey => ({
  id: 'seed-x', name: 'Test', wayIn: 'I1', wayHome: 'H1', optionId: null,
  places: [
    { node: 'GUA', hop: null },
    { node: 'SJO', hop: hop('GUA', 'SJO', { overland: 'Overland', countries: ['GT', 'SV', 'HN', 'NI', 'CR'] }) },
    { node: 'BOG', hop: hop('SJO', 'BOG', { mode: 'flight', flight: flight('2026-12-20T08:00', '2026-12-20T12:00') }) },
    { node: 'LPB', hop: hop('BOG', 'LPB', { mode: 'flight' }) },
    { node: 'CBB', hop: hop('LPB', 'CBB') },
    { node: 'LPB', hop: hop('CBB', 'LPB') },
  ],
  ...over,
})

describe('tripRoute', () => {
  it('lists the countries in order, with the ones an overland block crosses and stops in one country run together', () => {
    const r = tripRoute(data, journey())!
    expect(r.countries.map((c) => c.country)).toEqual(['GT', 'SV', 'HN', 'NI', 'CR', 'CO', 'BO'])
    expect(r.countries.map((c) => c.via)).toEqual([null, 'ground', 'ground', 'ground', 'ground', 'flight', 'flight'])
    // one overland stretch reaches SV, HN, NI and CR, so only SV starts it
    expect(r.countries.map((c) => c.same)).toEqual([false, false, true, true, true, false, false])
    expect(r.countries[1].places).toEqual([])
    expect(r.countries[6].places).toEqual(['La Paz', 'Cochabamba'])
  })

  it('names home, the landing and the city the flight home leaves from', () => {
    const r = tripRoute(data, journey())!
    expect(r.home).toEqual({ country: 'DK', name: 'Copenhagen' })
    expect(r.land).toMatchObject({ name: 'Guatemala City', country: 'GT' })
    expect(r.out).toMatchObject({ name: 'La Paz', country: 'BO' })
    expect(routeLabel(r)).toBe('Copenhagen to Guatemala City, Guatemala, El Salvador, Honduras, Nicaragua, Costa Rica, Colombia, Bolivia, out from La Paz')
    expect(routeLabel(r, '14.200 kr')).toMatch(/out from La Paz, 14\.200 kr$/)
  })

  it('falls back to the stops when a hop does not say which countries it crosses', () => {
    const j = journey()
    j.places[1] = { node: 'SJO', hop: hop('GUA', 'SJO', { overland: 'Overland' }) }
    expect(tripRoute(data, j)!.countries.map((c) => c.country)).toEqual(['GT', 'CR', 'CO', 'BO'])
  })

  it('gives every leg a from, a to and the day it leaves', () => {
    const r = tripRoute(data, journey())!
    expect(r.legs.map((l) => `${l.from}>${l.to} ${l.date}${l.dated ? '' : '~'}`)).toEqual([
      'CPH>GUA 2026-12-02',
      // 17 days from the landing on 3 Dec to the flight on 20 Dec, shared by GUA and SJO
      'GUA>SJO 2026-12-12~',
      'SJO>BOG 2026-12-20',
      // 44 days from 20 Dec to the flight home, 11 for each of the four stops
      'BOG>LPB 2026-12-31~',
      'LPB>CBB 2027-01-11~',
      'CBB>LPB 2027-01-22~',
      'LPB>CPH 2027-02-02',
    ])
    expect(flightLegs(r).map((l) => l.key)).toEqual(['in', 'hop2', 'hop3', 'home'])
    expect(flyOn(r.legs[0])).toBe('~2 Dec')
  })

  it('is null when a way has left the data', () => {
    expect(tripRoute(data, journey({ wayHome: 'gone' }))).toBeNull()
  })
})
