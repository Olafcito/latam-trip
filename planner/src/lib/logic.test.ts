import { describe, expect, it } from 'vitest'
import type { AppData, InOut, MapData, Ticket, Way } from '../data/types'
import { schedule, totals, type Journey } from './journey'
import { mixWays, priceOfWays, totalRating, priceScore } from './options'
import { shortestPath } from './graph'
import { kr, hours, dayTime, nextDayMark } from './format'
import { doorToDoorHours } from './time'

const ticket = (id: string, price: number, cabin: number | null = 0, checked: number | null = 300): Ticket => ({
  id, quote_id: 'Q:' + id, source: 'test', observed_at: '2026-10-28T12:00:00Z', structure: 'one_way', legs: [],
  price_dkk: price, fare_brand: null, cabin_bag: null, checked_bag: null, cabin_bag_fee_dkk: cabin,
  checked_bag_fee_dkk: checked, tickets_inside: 1, self_transfer: false, carriers: [], flags: [], notes: null, link: null,
})

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'BOG', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
  total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'BOG'],
  tickets: ['T1'], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})

const inout = (ways: Way[], tickets: Ticket[]): InOut => ({
  generated_at: '', currency: 'DKK', home: ['CPH'],
  rating: { formula: '', price_anchor_dkk: 7000, price_basis: '', way_score: '' },
  airports: {
    CPH: { name: 'Copenhagen', country: 'DK', lat: 55.6, lon: 12.6, region: null, utc_offset: 1, home: true },
    BOG: { name: 'Bogota', country: 'CO', lat: 4.7, lon: -74.1, region: 'CO', utc_offset: -5, home: false, map_node: 'BOG' },
    VVI: { name: 'Santa Cruz', country: 'BO', lat: -17.6, lon: -63.1, region: 'BO', utc_offset: -4, home: false, map_node: 'VVI' },
    MAD: { name: 'Madrid', country: 'ES', lat: 40.5, lon: -3.6, region: null, utc_offset: 1, home: false },
  },
  tickets: Object.fromEntries(tickets.map((t) => [t.id, t])),
  ways: Object.fromEntries(ways.map((w) => [w.id, w])),
  options: [],
})

const map: MapData = {
  nodes: [
    { id: 'BOG', name: 'Bogota', country: 'CO', lat: 4.7, lon: -74.1, type: 'city', iata: 'BOG', popularity: 1 },
    { id: 'MDE', name: 'Medellin', country: 'CO', lat: 6.2, lon: -75.6, type: 'city', iata: 'MDE', popularity: 1 },
    { id: 'LPB', name: 'La Paz', country: 'BO', lat: -16.5, lon: -68.1, type: 'city', iata: 'LPB', popularity: 2 },
    { id: 'VVI', name: 'Santa Cruz', country: 'BO', lat: -17.6, lon: -63.1, type: 'city', iata: 'VVI', popularity: 2 },
  ],
  edges: [
    { from: 'BOG', to: 'MDE', mode: 'bus', duration_h: 9, price_dkk: 150, both: true },
    { from: 'BOG', to: 'LPB', mode: 'flight', fastest_hours: 4, oneway_min_dkk: 1500 },
    { from: 'MDE', to: 'LPB', mode: 'flight', fastest_hours: 6, oneway_min_dkk: 900 },
    { from: 'LPB', to: 'VVI', mode: 'bus', duration_h: 16, price_dkk: 120, both: true },
    { from: 'BOG', to: 'VVI', mode: 'flight', fastest_hours: 7, oneway_min_dkk: 2600 },
  ],
}

describe('format', () => {
  it('writes Danish numbers and unknowns as ?', () => {
    expect(kr(6494)).toBe('6.494 kr')
    expect(kr(null)).toBe('?')
    expect(hours(14.5)).toBe('14h 30m')
    expect(dayTime('2026-12-03T06:00')).toBe('3 Dec 06:00')
    expect(nextDayMark('2026-12-03T22:00', '2026-12-04T05:00')).toBe('+1')
  })
  it('converts door to door with utc offsets', () => {
    expect(doorToDoorHours('2026-12-03T06:00', 1, '2026-12-03T14:30', -5)).toBeCloseTo(14.5)
  })
})

describe('schedule from dated flights', () => {
  const wi = way({ id: 'I1', arrive: '2026-12-03T14:30' })
  const wh = way({ id: 'H1', direction: 'home', from: 'VVI', to: 'CPH', depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10' })
  const names = (n: string) => n

  it('shares the days evenly between the landing and the flight home', () => {
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
      { node: 'BOG', hop: null },
      { node: 'VVI', hop: { from: 'BOG', to: 'VVI', mode: 'bus', operator: null, hours: 30, price_dkk: 100, overnight: true, border: true, flight: null } },
    ] }
    const s = schedule(j, wi, wh, 'VVI', names)
    expect(s.places[0].arrive).toBe('2026-12-03T14:30')
    expect(s.places[1].depart).toBe('2027-02-03T09:05')
    expect(s.totalDays).toBe(62) // 3 Dec -> 3 Feb
    expect(s.places.map((p) => p.days)).toEqual([31, 31])
    expect(s.places[0].depart).toBeNull()
    expect(s.places[1].arrive).toBeNull()
    expect(s.warnings.filter((w) => w.level === 'error')).toHaveLength(0)
  })

  it('anchors on a picked flight and splits the days around it', () => {
    const flight = { quote_id: 'Q', depart: '2026-12-20T23:00', arrive: '2026-12-21T04:00', hours: 4, price_dkk: 900, carriers: [], via: [], layover_h: [] }
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
      { node: 'BOG', hop: null },
      { node: 'VVI', hop: { from: 'BOG', to: 'VVI', mode: 'flight', operator: null, hours: 4, price_dkk: 900, overnight: false, border: false, flight } },
    ] }
    const s = schedule(j, wi, wh, 'VVI', names)
    expect(s.places[0].depart).toBe('2026-12-20T23:00')
    expect(s.places[1].arrive).toBe('2026-12-21T04:00')
    expect(s.places[0].days).toBe(17) // 3 Dec -> 20 Dec
    expect(s.places[1].days).toBe(44) // 21 Dec -> 3 Feb
    expect(s.warnings.filter((w) => w.level === 'error')).toHaveLength(0)
  })

  it('warns when a picked flight lands after the flight home leaves', () => {
    const flight = { quote_id: 'Q', depart: '2027-02-05T23:00', arrive: '2027-02-06T04:00', hours: 4, price_dkk: 900, carriers: [], via: [], layover_h: [] }
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
      { node: 'BOG', hop: null },
      { node: 'VVI', hop: { from: 'BOG', to: 'VVI', mode: 'flight', operator: null, hours: 4, price_dkk: 900, overnight: false, border: false, flight } },
    ] }
    const s = schedule(j, wi, wh, 'VVI', names)
    expect(s.places[1].days).toBe(0)
    expect(s.warnings.some((w) => w.level === 'error' && w.text.includes('lands after the flight home'))).toBe(true)
  })

  it('takes a date set on a leg as a dated moment, so the stops around it get exact days', () => {
    const bus = (from: string, to: string, over = {}) => ({ from, to, mode: 'bus' as const, operator: null, hours: 9, price_dkk: 150, overnight: false, border: false, flight: null, ...over })
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
      { node: 'BOG', hop: null },
      { node: 'MDE', hop: bus('BOG', 'MDE', { date: '2026-12-10' }) },
      { node: 'LPB', hop: bus('MDE', 'LPB') },
      { node: 'VVI', hop: bus('LPB', 'VVI', { date: '2027-01-20', overnight: true }) },
    ] }
    const s = schedule(j, wi, wh, 'VVI', names)
    expect(s.places[0]).toMatchObject({ days: 7, inDay: '2026-12-03', outDay: '2026-12-10', exact: true, depart: '2026-12-10' })
    // MDE and LPB share 10 Dec to 20 Jan between them
    expect(s.places.slice(1, 3).map((p) => p.days)).toEqual([21, 20])
    expect(s.places.slice(1, 3).map((p) => p.exact)).toEqual([false, false])
    expect(s.places[2]).toMatchObject({ inDay: '2026-12-31', outDay: '2027-01-20' })
    // an overnight leg gets there the day after
    expect(s.places[3]).toMatchObject({ arrive: '2027-01-21', inDay: '2027-01-21', days: 13, exact: true })
    expect(s.warnings).toHaveLength(0)
  })

  it("keeps a picked flight's times on the day set, and warns when the day set is another", () => {
    const flight = { quote_id: 'Q', depart: '2026-12-20T23:00', arrive: '2026-12-21T04:00', hours: 4, price_dkk: 900, carriers: [], via: [], layover_h: [] }
    const hop = (date: string) => ({ from: 'BOG', to: 'VVI', mode: 'flight' as const, operator: null, hours: 4, price_dkk: 900, overnight: false, border: false, flight, date })
    const j = (date: string): Journey => ({ id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [{ node: 'BOG', hop: null }, { node: 'VVI', hop: hop(date) }] })
    const same = schedule(j('2026-12-20'), wi, wh, 'VVI', names)
    expect(same.places[1].arrive).toBe('2026-12-21T04:00')
    expect(same.warnings).toHaveLength(0)
    const other = schedule(j('2026-12-15'), wi, wh, 'VVI', names)
    expect(other.places[0]).toMatchObject({ depart: '2026-12-15', days: 12 })
    expect(other.warnings.some((w) => w.level === 'warn' && w.text.includes('price is for another day'))).toBe(true)
  })

  it('never calls a same day leg early: arriving at 14:30 and leaving that day is fine', () => {
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
      { node: 'BOG', hop: null },
      { node: 'VVI', hop: { from: 'BOG', to: 'VVI', mode: 'bus', operator: null, hours: 30, price_dkk: 100, overnight: false, border: true, flight: null, date: '2026-12-03' } },
    ] }
    const s = schedule(j, wi, wh, 'VVI', names)
    expect(s.places[0].days).toBe(0)
    expect(s.warnings.filter((w) => w.level === 'error')).toHaveLength(0)
    const early = schedule({ ...j, places: [j.places[0], { ...j.places[1], hop: { ...j.places[1].hop!, date: '2026-12-01' } }] }, wi, wh, 'VVI', names)
    expect(early.warnings.some((w) => w.level === 'error' && w.text.includes('leaves 1 Dec'))).toBe(true)
  })

  it('warns when the journey does not end at the exit', () => {
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [{ node: 'BOG', hop: null }] }
    expect(schedule(j, wi, wh, 'VVI', names).warnings.some((w) => w.text.includes('end in VVI'))).toBe(true)
  })
})

describe('price totals with a shared ticket', () => {
  const T1 = ticket('T1', 6000, 0, 300)
  const T2 = ticket('T2', 700, 180, null)
  const wi = way({ id: 'I1', tickets: ['T2', 'T1'], shared_ticket: 'T1', paired_with: 'H1', type: 'madrid', flights: 3, flying_hours: 17.9,
    timeline: [
      { kind: 'night', airport: 'MAD', arrive: '2026-12-01T18:55', depart: '2026-12-02T08:10', hours: 13.25, nights: 1, same_ticket: false, stay_estimate_dkk: 450 },
    ] })
  const wh = way({ id: 'H1', direction: 'home', from: 'VVI', to: 'CPH', tickets: ['T1'], shared_ticket: 'T1', paired_with: 'I1', type: 'madrid', flights: 2, flying_hours: 14.7,
    depart: '2027-02-02T03:45', arrive: '2027-02-02T23:25' })
  const io = inout([wi, wh], [T1, T2])

  it('counts the shared ticket once and keeps bags and hub stays apart', () => {
    const p = priceOfWays(io, [wi, wh])
    expect(p.price_dkk).toBe(6700)
    expect(p.cabin).toBe(180)
    expect(p.checked).toBeNull() // one ticket has an unknown checked-bag fee
    const data: AppData = { inout: io, map, bags: [], trip: {}, source: 'local', meta: null }
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
      { node: 'BOG', hop: null },
      { node: 'MDE', hop: { from: 'BOG', to: 'MDE', mode: 'bus', operator: null, hours: 9, price_dkk: 150, overnight: false, border: false, flight: null } },
      { node: 'VVI', hop: { from: 'MDE', to: 'VVI', mode: 'flight', operator: null, hours: 6, price_dkk: 900, overnight: false, border: false, flight: null } },
    ] }
    const t = totals(data, j, null)
    expect(t.tickets_dkk).toBe(6700)
    expect(t.regional_flights_dkk).toBe(900)
    expect(t.ground_dkk).toBe(150)
    expect(t.hub_nights).toBe(1)
    expect(t.hub_stay_dkk).toBe(450)
    expect(t.flights).toBe(6)
    expect(t.air_hours).toBeCloseTo(38.6)
    expect(t.days_per_country.ES).toBe(1)
  })
})

describe('mixing one-way ways', () => {
  const wi = way({ id: 'I1', tickets: ['A'], score: 4 })
  const wh = way({ id: 'H1', direction: 'home', from: 'VVI', to: 'CPH', tickets: ['B'], score: 3, hub_nights: 1,
    extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 1, hub_stay_estimate_dkk: 450 } })
  const io = inout([wi, wh], [ticket('A', 4000, 100), ticket('B', 3500, 0)])

  it('adds price and extras of the two ways and rates the pair', () => {
    const o = mixWays(io, wi, wh)
    expect(o.price_dkk).toBe(7500)
    expect(o.extras.cabin_bag_fees_dkk).toBe(100)
    expect(o.extras.hub_nights).toBe(1)
    expect(o.entry).toBe('BOG')
    expect(o.exit).toBe('VVI')
    // price score 5 - (7600 - 7000)/1000 = 4.4; total 2 x (2.2 + 0.9 + 0.8) = 7.8
    expect(o.rating.total).toBe(7.8)
    expect(totalRating(priceScore(7000), 5, 5)).toBe(10)
  })

  it('refuses to split a ticket way from its pair', () => {
    const tIn = way({ id: 'I2', type: 'ticket', paired_with: 'H9', tickets: ['A'] })
    expect(() => mixWays(io, tIn, wh)).toThrow(/only goes with H9/)
  })
})

describe('shortest path', () => {
  it('finds the fastest route by hours', () => {
    const r = shortestPath(map, 'BOG', 'VVI', 'hours')!
    expect(r.nodes).toEqual(['BOG', 'VVI'])
    expect(r.cost).toBe(7)
  })
  it('finds the cheapest route by price, using two-way roads backwards', () => {
    const r = shortestPath(map, 'BOG', 'VVI', 'price')!
    expect(r.nodes).toEqual(['BOG', 'MDE', 'LPB', 'VVI'])
    expect(r.cost).toBe(1170)
    const back = shortestPath(map, 'VVI', 'LPB', 'price')!
    expect(back.nodes).toEqual(['VVI', 'LPB'])
  })
  it('returns null when there is no route', () => {
    expect(shortestPath(map, 'VVI', 'BOG', 'hours')).toBeNull()
  })
})
