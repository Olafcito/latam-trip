import { describe, expect, it } from 'vitest'
import type { AppData, Booking, InOut, Lodging, MapData, Ticket, Way } from '../data/types'
import { applyMove, giveNight, regionalCost, schedule, staysCost, totals, travelCost, travelTotal, travelUnknown, type Hop, type Journey } from './journey'
import { mixWays, priceOfWays, totalRating, priceScore } from './options'
import { shortestPath } from './graph'
import { kr, hours, dayTime, nextDayMark } from './format'
import { addDays, doorToDoorHours } from './time'

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
    expect(kr(null)).toBe('no price')
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

  it("keeps a picked flight's times on the day set, and the day set wins with no warning", () => {
    const flight = { quote_id: 'Q', depart: '2026-12-20T23:00', arrive: '2026-12-21T04:00', hours: 4, price_dkk: 900, carriers: [], via: [], layover_h: [] }
    const hop = (date: string) => ({ from: 'BOG', to: 'VVI', mode: 'flight' as const, operator: null, hours: 4, price_dkk: 900, overnight: false, border: false, flight, date })
    const j = (date: string): Journey => ({ id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [{ node: 'BOG', hop: null }, { node: 'VVI', hop: hop(date) }] })
    const same = schedule(j('2026-12-20'), wi, wh, 'VVI', names)
    expect(same.places[1].arrive).toBe('2026-12-21T04:00')
    expect(same.warnings).toHaveLength(0)
    const other = schedule(j('2026-12-15'), wi, wh, 'VVI', names)
    expect(other.places[0]).toMatchObject({ depart: '2026-12-15', days: 12 })
    expect(other.warnings).toHaveLength(0)
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

  it('points a leg that leaves too early at itself and offers the first day that works', () => {
    const bus: Hop = { from: 'BOG', to: 'VVI', mode: 'bus', operator: null, hours: 30, price_dkk: 100, overnight: false, border: true, flight: null, date: '2026-12-01' }
    const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [{ node: 'BOG', hop: null }, { node: 'VVI', hop: bus }] }
    const w = schedule(j, wi, wh, 'VVI', names).warnings.find((x) => x.level === 'error')!
    // a bus with no time can leave the day you land
    expect(w).toMatchObject({ leg: 1, fix: wi.arrive.slice(0, 10) })
    // a flight picked for the landing day leaves before you land, so the next day
    const flight = { depart: `${wi.arrive.slice(0, 10)}T05:30`, arrive: `${wi.arrive.slice(0, 10)}T09:00`, hours: 3.5, price_dkk: 900, carriers: ['AV'], via: [], layover_h: [] } as unknown as Hop['flight']
    const early = schedule({ ...j, places: [j.places[0], { node: 'VVI', hop: { ...bus, mode: 'flight', date: undefined, flight } }] }, wi, wh, 'VVI', names)
    expect(early.warnings.find((x) => x.level === 'error')).toMatchObject({ leg: 1, fix: addDays(wi.arrive.slice(0, 10), 1) })
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
    const data: AppData = { inout: io, map, bags: [], trip: {}, source: 'project', meta: null }
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

describe('paid prices and booked days', () => {
  // Made up rows only. A real reference, price or name never goes in this file.
  const row = (over: Partial<Booking>): Booking => ({
    id: 'b1', kind: 'flight', status: 'booked', from_code: null, to_code: null, depart: null, arrive: null,
    place_id: null, check_in: null, check_out: null, lodging_id: null, room_id: null, reference: 'TEST01', seller: null,
    url: null, price_dkk: null, price: null, currency: null, refundable: null, changeable: null, change_until: null,
    cancel_until: null, cabin_bag: null, checked_bag: null, segments: null, travellers: 1, trip_id: null, ticket: null,
    source: 'manual', notes: null, attachments: [], created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
    ...over,
  })
  const T1 = ticket('T1', 6000, 0, 300)
  const wi = way({ id: 'I1', tickets: ['T1'], shared_ticket: 'T1', paired_with: 'H1', type: 'ticket' })
  const wh = way({ id: 'H1', direction: 'home', from: 'VVI', to: 'CPH', tickets: ['T1'], shared_ticket: 'T1', paired_with: 'I1', type: 'ticket',
    depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10' })
  const data: AppData = { inout: inout([wi, wh], [T1]), map, bags: [], trip: {}, source: 'project', meta: null }
  const hop = (from: string, to: string, over: Partial<Hop>): Hop => ({ from, to, mode: 'flight', operator: null, hours: 6, price_dkk: 1500, overnight: false, border: false, flight: null, ...over })
  const j: Journey = { id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
    { node: 'BOG', hop: null },
    { node: 'MDE', hop: hop('BOG', 'MDE', { mode: 'bus', hours: 9, price_dkk: 150, date: '2026-12-10' }) },
    { node: 'VVI', hop: hop('MDE', 'VVI', { date: '2026-12-20' }) },
  ] }
  const names = (n: string) => n
  const sched = schedule(j, wi, wh, 'VVI', names)
  const wayIn = row({ id: 'w-in', from_code: 'CPH', to_code: 'BOG', depart: '2026-12-03T06:00', ticket: 'G1', price_dkk: 8000 })
  const wayHome = row({ id: 'w-home', from_code: 'VVI', to_code: 'CPH', depart: '2027-02-03T09:05', ticket: 'G1' })
  const regional = row({ id: 'reg', from_code: 'MDE', to_code: 'VVI', depart: '2026-12-20T10:00', price_dkk: 900 })
  const bus = row({ id: 'bus', kind: 'bus', from_code: 'BOG', to_code: 'MDE', depart: '2026-12-10', price_dkk: 200 })
  const stay = row({ id: 'stay', kind: 'stay', place_id: 'MDE', check_in: '2026-12-12', check_out: '2026-12-15', price_dkk: 1200 })

  it('counts a ticket booked as two rows of one group once, whatever the quote says', () => {
    expect(totals(data, j, sched).tickets_dkk).toBe(6000)
    expect(totals(data, j, sched, [wayIn, wayHome]).tickets_dkk).toBe(8000)
    expect(totals(data, j, sched, [wayHome, wayIn]).tickets_dkk).toBe(8000)
  })

  it('puts the paid price of a booked leg in place of its quote', () => {
    expect(totals(data, j, sched).regional_flights_dkk).toBe(1500)
    expect(totals(data, j, sched, [regional]).regional_flights_dkk).toBe(900)
    expect(totals(data, j, sched, [bus]).ground_dkk).toBe(200)
  })

  it('counts the quote of a booked leg or ticket whose price is not filled in, once', () => {
    const noPrice = { ...regional, price_dkk: null }
    expect(totals(data, j, sched, [noPrice]).regional_flights_dkk).toBe(1500)
    const first = { ...wayIn, price_dkk: null }
    const second = { ...wayHome, price_dkk: 0 }
    expect(totals(data, j, sched, [first, second]).tickets_dkk).toBe(6000)
    expect(totals(data, j, sched, [{ ...bus, price_dkk: null }]).ground_dkk).toBe(150)
  })

  it('counts a regional flight with no price as not priced, never as 0', () => {
    const bare: Journey = { ...j, places: j.places.map((p, k) => (k === 2 ? { ...p, hop: { ...p.hop!, price_dkk: null } } : p)) }
    const t = totals(data, bare, sched)
    expect(t.regional_unknown).toBe(1)
    expect(t.regional_flights_dkk).toBe(0)
    expect(regionalCost(t)).toBe('Not priced')
    expect(travelUnknown(t)).toBe(1)
    expect(travelCost(t)).toBe(`${kr(travelTotal(t))}, 1 not priced`)
    // a booked flight with its price filled in counts what was paid
    expect(totals(data, bare, sched, [regional])).toMatchObject({ regional_flights_dkk: 900, regional_unknown: 0 })
    expect(totals(data, j, sched).regional_unknown).toBe(0)
  })

  it('adds a booked stay to the stays and leaves it out of the travel total', () => {
    const plain = totals(data, j, sched)
    const t = totals(data, j, sched, [stay])
    expect(plain.stays_booked_dkk).toBe(0)
    expect(t.stays_booked_dkk).toBe(1200)
    expect(travelTotal(t)).toBe(travelTotal(plain))
  })

  it('warns on a leg booked a day off with the day it is booked on, and counts its quote', () => {
    const off = row({ ...regional, depart: '2026-12-21T10:00' })
    const s = schedule(j, wi, wh, 'VVI', names, [off], data)
    expect(s.warnings).toContainEqual({ level: 'warn', text: 'Booked on 21 Dec', leg: 2 })
    expect(schedule(j, wi, wh, 'VVI', names, [regional], data).warnings).toEqual(sched.warnings)
    // without the data to match by, no booking is looked at
    expect(schedule(j, wi, wh, 'VVI', names, [off]).warnings).toEqual(sched.warnings)
    expect(totals(data, j, s, [off]).regional_flights_dkk).toBe(1500)
  })

  it('changes nothing for a cancelled booking', () => {
    const all = [wayIn, wayHome, regional, bus, stay, row({ ...regional, id: 'off', depart: '2026-12-21T10:00' })].map((b) => ({ ...b, status: 'cancelled' as const }))
    expect(totals(data, j, sched, all)).toEqual(totals(data, j, sched))
    expect(schedule(j, wi, wh, 'VVI', names, all, data)).toEqual(sched)
  })
})

describe('planned stays and booked stays at the stops', () => {
  // Made up places, rooms, rows and prices only. A real name, reference or price never goes in this file.
  const row = (over: Partial<Booking>): Booking => ({
    id: 'b1', kind: 'stay', status: 'booked', from_code: null, to_code: null, depart: null, arrive: null,
    place_id: 'MDE', check_in: null, check_out: null, lodging_id: null, room_id: null, reference: 'TEST01', seller: null,
    url: null, price_dkk: null, price: null, currency: null, refundable: null, changeable: null, change_until: null,
    cancel_until: null, cabin_bag: null, checked_bag: null, segments: null, travellers: 1, trip_id: null, ticket: null,
    source: 'manual', notes: null, attachments: [], created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
    ...over,
  })
  const lodging = (id: string, name: string, total: number): Lodging => ({
    id, place_id: 'MDE', name, kind: 'hostel', photos: [], rating: null, reviews: null, rating_source: null, address: null,
    lat: null, lon: null, to_center_km: null, to_beach_km: null, tags: [], summary: null, notes: null, links: [], added_by: 'simon',
    hidden: false, created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
    rooms: [{ id: 'R1', lodging_id: id, name: 'TEST01 dorm', beds: 6, private: false, bathroom: 'shared', notes: null,
      created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
      prices: [{ id: 'p-' + id, room_id: 'R1', check_in: '2026-12-10', check_out: '2026-12-20', total_dkk: total, per_night_dkk: null,
        site: null, url: null, refundable: null, cancel_until: null, observed_at: '2026-11-03T10:00:00Z' }] }],
  })
  const T1 = ticket('T1', 6000, 0, 300)
  const wi = way({ id: 'I1', tickets: ['T1'], shared_ticket: 'T1', paired_with: 'H1', type: 'ticket' })
  const wh = way({ id: 'H1', direction: 'home', from: 'VVI', to: 'CPH', tickets: ['T1'], shared_ticket: 'T1', paired_with: 'I1', type: 'ticket',
    depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10' })
  const data: AppData = { inout: inout([wi, wh], [T1]), map, bags: [], trip: {}, source: 'project', meta: null }
  const hop = (from: string, to: string, over: Partial<Hop>): Hop => ({ from, to, mode: 'flight', operator: null, hours: 6, price_dkk: 1500, overnight: false, border: false, flight: null, ...over })
  /** Medellin from the 10th until the flight on leaves on the 20th, 10 nights */
  const trip = (stays?: { lodging_id: string; room_id: string }[]): Journey => ({ id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [
    { node: 'BOG', hop: null },
    { node: 'MDE', hop: hop('BOG', 'MDE', { mode: 'bus', hours: 9, price_dkk: 150, date: '2026-12-10' }), ...(stays ? { stays } : {}) },
    { node: 'VVI', hop: hop('MDE', 'VVI', { date: '2026-12-20' }) },
  ] })
  const names = (n: string) => n
  const casa = lodging('L1', 'TEST01 Casa', 3000)
  const planned = trip([{ lodging_id: 'L1', room_id: 'R1' }])
  const sched = schedule(planned, wi, wh, 'VVI', names)

  it('adds the planned stays to their own line and not to the travel total', () => {
    const plain = totals(data, trip(), schedule(trip(), wi, wh, 'VVI', names), [], [casa])
    const t = totals(data, planned, sched, [], [casa])
    expect(t.stays_planned_dkk).toBe(3000)
    expect(t.stays_unknown).toBe(0)
    expect(t.stays_booked_dkk).toBe(0)
    expect(travelTotal(t)).toBe(travelTotal(plain))
    expect(plain.stays_planned_dkk).toBe(0)
  })

  it('counts a planned stay with no price found as not known, never as 0', () => {
    const t = totals(data, planned, sched, [], [])
    expect(t.stays_planned_dkk).toBe(0)
    expect(t.stays_unknown).toBe(1)
    // a saved row's totals are worked out without the places to stay, so they hold none of their numbers
    expect(totals(data, planned, sched)).toMatchObject({ stays_planned_dkk: 0, stays_unknown: 0 })
    // a booked stay with no price filled in is still not known there, and one with a price still counts
    const bare = row({ id: 'bare', check_in: '2026-12-12', check_out: '2026-12-15' })
    expect(totals(data, planned, sched, [bare])).toMatchObject({ stays_booked_dkk: 0, stays_unknown: 1 })
    expect(totals(data, planned, sched, [{ ...bare, price_dkk: 1200 }])).toMatchObject({ stays_booked_dkk: 1200, stays_unknown: 0 })
  })

  it('does not count a booked stay again as planned, and counts the plan in place of a booked price not filled in', () => {
    const booked = row({ id: 'casa', lodging_id: 'L1', check_in: '2026-12-12', check_out: '2026-12-15', price_dkk: 1200 })
    const t = totals(data, planned, sched, [booked], [casa])
    // the 3 booked nights count as booked, the other 7 of the 10 planned at 3000 stay planned
    expect(t).toMatchObject({ stays_booked_dkk: 1200, stays_planned_dkk: 2100, stays_unknown: 0 })
    // a booking that names no place to stay is the part all the same, so it is not counted twice
    expect(totals(data, planned, sched, [{ ...booked, lodging_id: null }], [casa])).toMatchObject({ stays_booked_dkk: 1200, stays_planned_dkk: 2100 })
    // a booking of every planned night leaves nothing planned
    const whole = { ...booked, check_in: '2026-12-10', check_out: '2026-12-20', price_dkk: 2800 }
    expect(totals(data, planned, sched, [whole], [casa])).toMatchObject({ stays_booked_dkk: 2800, stays_planned_dkk: 0, stays_unknown: 0 })
    const noPrice = totals(data, planned, sched, [{ ...booked, price_dkk: null }], [casa])
    expect(noPrice).toMatchObject({ stays_booked_dkk: 0, stays_planned_dkk: 3000, stays_unknown: 0 })
    // with no plan to stand in for it, a booked stay with no price is not known
    const alone = totals(data, trip(), schedule(trip(), wi, wh, 'VVI', names), [{ ...booked, price_dkk: null }], [casa])
    expect(alone).toMatchObject({ stays_booked_dkk: 0, stays_planned_dkk: 0, stays_unknown: 1 })
  })

  it('shows booked and planned apart on the Stays line, and the stays with no price as not priced', () => {
    const t = totals(data, planned, sched, [], [casa])
    expect(staysCost(t)).toBe(`${kr(3000)} planned`)
    expect(staysCost({ ...t, stays_booked_dkk: 1200, stays_unknown: 1 })).toBe(`${kr(1200)} booked, ${kr(3000)} planned, 1 not priced`)
    expect(staysCost({ ...t, stays_planned_dkk: 0, stays_unknown: 2 })).toBe('2 not priced')
    expect(staysCost(totals(data, trip(), schedule(trip(), wi, wh, 'VVI', names), [], [casa]))).toBeNull()
  })

  it('takes a night off a stop that cuts into a booked stay, and warns with the place and its last free cancel day', () => {
    const booked = row({ id: 'casa', lodging_id: 'L1', check_in: '2026-12-17', check_out: '2026-12-20', price_dkk: 900, cancel_until: '2026-11-20' })
    const j = trip()
    const before = schedule(j, wi, wh, 'VVI', names, [booked], data, [casa])
    expect(before.warnings.filter((w) => w.stop != null)).toEqual([])
    const move = giveNight(j, before, 1)
    expect(move).not.toBeNull()
    const less = applyMove(j, move!)
    const after = schedule(less, wi, wh, 'VVI', names, [booked], data, [casa])
    expect(after.places[1].days).toBe(9)
    expect(after.warnings).toContainEqual({ level: 'warn', text: 'Cuts into your booking at TEST01 Casa, free to cancel until 20 Nov', stop: 1 })
    // the booked stay is paid for all the same
    expect(totals(data, less, after, [booked], [casa]).stays_booked_dkk).toBe(900)
    // without a place to stay to name it by, the seller names it, and without a cancel day the warning says no more
    const sold = { ...booked, lodging_id: null, seller: 'TEST01 seller', cancel_until: null }
    expect(schedule(less, wi, wh, 'VVI', names, [sold], data).warnings).toContainEqual({ level: 'warn', text: 'Cuts into your booking at TEST01 seller', stop: 1 })
    // a cancelled stay warns of nothing
    expect(schedule(less, wi, wh, 'VVI', names, [{ ...booked, status: 'cancelled' }], data, [casa]).warnings.filter((w) => w.stop != null)).toEqual([])
  })

  /** the trip with the leg on to Viedma moved to the day given */
  const onTo = (date: string): Journey => ({ ...trip(), places: trip().places.map((p, k) => (k === 2 ? { ...p, hop: { ...p.hop!, date } } : p)) })
  const casaBooked = row({ id: 'casa', lodging_id: 'L1', check_in: '2026-12-17', check_out: '2026-12-20', price_dkk: 900, cancel_until: '2026-11-20', trip_id: 'j' })

  it('warns on the stop when a leg moves it wholly off a booked stay, and counts the stay as paid', () => {
    const j = onTo('2026-12-15')
    const s = schedule(j, wi, wh, 'VVI', names, [casaBooked], data, [casa])
    expect(s.places[1].days).toBe(5)
    expect(s.warnings).toContainEqual({ level: 'warn', text: 'Misses your booking at TEST01 Casa, free to cancel until 20 Nov', stop: 1 })
    expect(totals(data, j, s, [casaBooked], [casa]).stays_booked_dkk).toBe(900)
    // a stay booked for no trip is still the trip's when the trip stops at its place
    const free = { ...casaBooked, trip_id: null }
    expect(schedule(j, wi, wh, 'VVI', names, [free], data, [casa]).warnings).toContainEqual({ level: 'warn', text: 'Misses your booking at TEST01 Casa, free to cancel until 20 Nov', stop: 1 })
    expect(totals(data, j, s, [free], [casa]).stays_booked_dkk).toBe(900)
    // a stay booked for another trip is that trip's, not this one's
    const other = { ...casaBooked, trip_id: 'k' }
    expect(schedule(j, wi, wh, 'VVI', names, [other], data, [casa]).warnings.filter((w) => w.stop != null)).toEqual([])
    expect(totals(data, j, s, [other], [casa]).stays_booked_dkk).toBe(0)
  })

  it('warns in the general list when the trip no longer stops at a booked stay, and counts the stay as paid', () => {
    const j: Journey = { ...trip(), places: [{ node: 'BOG', hop: null }, { node: 'VVI', hop: hop('BOG', 'VVI', { date: '2026-12-20' }) }] }
    const s = schedule(j, wi, wh, 'VVI', names, [casaBooked], data, [casa])
    expect(s.warnings).toContainEqual({ level: 'warn', text: 'Your booking at TEST01 Casa is in MDE, where the trip no longer stops, free to cancel until 20 Nov' })
    expect(totals(data, j, s, [casaBooked], [casa]).stays_booked_dkk).toBe(900)
    // a stay booked for no trip at a place the trip does not stop at is not this trip's
    const free = { ...casaBooked, trip_id: null }
    expect(schedule(j, wi, wh, 'VVI', names, [free], data, [casa]).warnings.filter((w) => w.text.includes('Casa'))).toEqual([])
    expect(totals(data, j, s, [free], [casa]).stays_booked_dkk).toBe(0)
  })

  it('reads the last stop by its planned nights and its free nights, so a stay booked on the free nights fits', () => {
    const j: Journey = { ...trip([{ lodging_id: 'L1', room_id: 'R1' }]), lastNights: 5 }
    j.places[2] = { ...j.places[2], stays: [{ lodging_id: 'L1', room_id: 'R1' }] }
    const at = (check_in: string, check_out: string) => row({ id: 'end', place_id: 'VVI', lodging_id: 'L1', check_in, check_out, price_dkk: 500, trip_id: 'j' })
    const s = schedule(j, wi, wh, 'VVI', names)
    expect(s.places[2].days).toBe(5)
    expect(s.free).toBeGreaterThan(0)
    // the 5 planned nights booked: no warning, and the part is booked, not planned again
    const fits = at('2026-12-20', '2026-12-25')
    expect(schedule(j, wi, wh, 'VVI', names, [fits], data, [casa]).warnings.filter((w) => w.stop === 2)).toEqual([])
    const both = totals(data, j, s, [fits], [casa])
    expect(both.stays_booked_dkk).toBe(500)
    expect(both.stays_planned_dkk).toBe(3000)
    // the free nights after them are slept at the stop too, up to the night before the way home, so a stay there fits
    for (const b of [at('2026-12-26', '2026-12-28'), at('2026-12-23', '2026-12-27'), at('2027-01-30', '2027-02-03')]) {
      expect(schedule(j, wi, wh, 'VVI', names, [b], data, [casa]).warnings.filter((w) => w.stop === 2)).toEqual([])
    }
    // a stay past the way home, or from before the stop, still cuts into the booking
    expect(schedule(j, wi, wh, 'VVI', names, [at('2027-02-01', '2027-02-05')], data, [casa]).warnings).toContainEqual({ level: 'warn', text: 'Cuts into your booking at TEST01 Casa', stop: 2 })
    expect(schedule(j, wi, wh, 'VVI', names, [at('2026-12-18', '2026-12-22')], data, [casa]).warnings).toContainEqual({ level: 'warn', text: 'Cuts into your booking at TEST01 Casa', stop: 2 })
  })
})
