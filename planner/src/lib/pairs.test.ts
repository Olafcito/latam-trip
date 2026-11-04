import { describe, expect, it } from 'vitest'
import type { Booking, InOut, Option, Ticket, Way } from '../data/types'
import { DEFAULT_FILTERS } from './options'
import type { BookData } from './booked'
import type { Journey } from './journey'
import { allIn, cityChoices, flagChip, heldSides, homeChoices, mixOption, oneWaysFor, pairRows, pickedOf, pickOptionId, pointsLost, scoreParts, ticketsOf, typeTiles, type FullOption, type PairFilters } from './pairs'

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'CTG', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
  total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'CTG'],
  tickets: [], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})
const home = (over: Partial<Way>): Way => way({ direction: 'home', from: 'GUA', to: 'CPH', ...over })
const ticket = (id: string, price_dkk: number, over: Partial<Ticket> = {}) =>
  ({ id, price_dkk, cabin_bag_fee_dkk: 0, checked_bag_fee_dkk: 0, legs: [], flags: [], carriers: [], ...over }) as unknown as Ticket

const opt = (id: string, wi: Way, wh: Way, over: Partial<FullOption> = {}): FullOption => ({
  id, type: wi.type, entry: wi.to, exit: wh.from, way_in: wi.id, way_home: wh.id, price_dkk: 7000,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: null, hub_nights: wi.hub_nights + wh.hub_nights, hub_stay_estimate_dkk: 0 },
  rating: { total: 9, price: 5, way_in: wi.score, way_home: wh.score }, ...over,
})

// Cartagena in, Guatemala City home on one ticket, dear and good
const tIn = way({ id: 'I_t', type: 'ticket', tickets: ['TA'], shared_ticket: 'TA', paired_with: 'H_t' })
const tHome = home({ id: 'H_t', type: 'ticket', tickets: ['TA'], shared_ticket: 'TA', paired_with: 'I_t' })
// the same cities on two one ways, cheaper with a night at a hub
const oIn = way({ id: 'I_o', tickets: ['TO1'], price_dkk: 3000, hub_nights: 1, score: 4, depart: '2026-12-02T09:00' })
const oIn2 = way({ id: 'I_o2', tickets: ['TO3'], price_dkk: 2800, score: 5, depart: '2026-12-04T09:00' })
const oHome = home({ id: 'H_o', tickets: ['TO2'], price_dkk: 3200, score: 5, depart: '2027-02-03T09:00' })
// Cancún in, Mexico City home through the United States, cheapest
const mIn = way({ id: 'I_m', to: 'CUN', tickets: ['TM1'], price_dkk: 3000, us_transit: true, score: 4 })
const mHome = home({ id: 'H_m', from: 'MEX', tickets: ['TM2'], price_dkk: 3100, score: 4 })
// from Billund, which the list must not mix with Copenhagen
const bIn = way({ id: 'I_b', from: 'BLL', tickets: ['TB'], price_dkk: 1000 })
const bHome = home({ id: 'H_b', to: 'BLL', tickets: ['TB2'], price_dkk: 1000 })

const options: FullOption[] = [
  opt('CTG-GUA-ticket', tIn, tHome, { price_dkk: 7400, total_dkk: 7400, rating: { total: 9.6, price: 4.6, way_in: 5, way_home: 5, on_total: 9.6 } }),
  opt('CTG-GUA-oneways', oIn, oHome, { price_dkk: 6200, total_dkk: 6600, extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: null, hub_nights: 1, hub_stay_estimate_dkk: 400 }, rating: { total: 9.4, price: 5, way_in: 4, way_home: 5 } }),
  opt('CUN-MEX-oneways', mIn, mHome, { price_dkk: 6100, total_dkk: 6100, rating: { total: 9, price: 5, way_in: 4, way_home: 4 } }),
  opt('BLL', bIn, bHome, { price_dkk: 2000, total_dkk: 2000 }),
]

const inout = {
  generated_at: '', currency: 'DKK', home: ['CPH'],
  airports: {
    CTG: { name: 'Cartagena', country: 'CO', region: 'CO' }, GUA: { name: 'Guatemala City', country: 'GT', region: 'CA' },
    CUN: { name: 'Cancún', country: 'MX', region: 'MX' }, MEX: { name: 'Mexico City', country: 'MX', region: 'MX' },
  },
  rating: { formula: '', price_anchor_dkk: 7000, price_basis: '', way_score: '' },
  tickets: {
    TA: ticket('TA', 7400, { legs: ['CPH>CTG', 'GUA>CPH'] }), TO1: ticket('TO1', 3000), TO2: ticket('TO2', 3200), TO3: ticket('TO3', 2800),
    TM1: ticket('TM1', 3000), TM2: ticket('TM2', 3100), TB: ticket('TB', 1000), TB2: ticket('TB2', 1000),
  },
  ways: Object.fromEntries([tIn, tHome, oIn, oIn2, oHome, mIn, mHome, bIn, bHome].map((w) => [w.id, w])),
  options: options as Option[],
} as unknown as InOut

describe('the all in price', () => {
  it('is the total the build worked out', () => {
    expect(allIn(options[1])).toBe(6600)
  })
  it('adds the cabin bags and the hub stay when the build left it out', () => {
    const o = { ...options[1], total_dkk: undefined, extras: { cabin_bag_fees_dkk: 150, checked_bag_fees_dkk: null, hub_nights: 1, hub_stay_estimate_dkk: 400 } }
    expect(allIn(o)).toBe(6750)
  })
  it('counts an unknown fee as nothing, not as no price', () => {
    const o = { ...options[0], total_dkk: undefined, extras: { cabin_bag_fees_dkk: null, checked_bag_fees_dkk: null, hub_nights: 0, hub_stay_estimate_dkk: null } }
    expect(allIn(o)).toBe(7400)
  })
})

describe('the points a way loses', () => {
  it('loses nothing on a plain way', () => {
    expect(pointsLost(tIn)).toEqual([])
  })
  it('loses a point per hub night, for a change, for the United States and for long flights', () => {
    const w = way({ hub_nights: 2, changes: 1, us_transit: true, flying_hours: 24 })
    expect(pointsLost(w)).toEqual([
      { kind: 'night', points: 2 },
      { kind: 'change', points: 1 },
      { kind: 'us', points: 1 },
      { kind: 'long', points: 2 },
    ])
  })
  it('loses one point for a flight over 20 hours', () => {
    expect(pointsLost(way({ flying_hours: 21 }))).toEqual([{ kind: 'long', points: 1 }])
  })
})

describe('the parts of the score', () => {
  it('splits the score into price out of 5, home out of 3 and in out of 2', () => {
    expect(scoreParts({ total: 9.4, price: 5, way_in: 4, way_home: 5 })).toEqual({ price: 5, home: 3, in: 1.6, total: 9.6 })
  })
})

describe('the pairs of a home', () => {
  it('makes one row per pair from the home only', () => {
    const rows = pairRows(inout, 'CPH', DEFAULT_FILTERS, 'best')
    expect(rows.map((r) => r.key)).toEqual(['CTG|GUA', 'CUN|MEX'])
    expect(rows[0].options).toHaveLength(2)
  })
  it('puts the best option of the pair first and keeps its cheapest', () => {
    const [r] = pairRows(inout, 'CPH', DEFAULT_FILTERS, 'best')
    expect(r.best.id).toBe('CTG-GUA-ticket')
    expect(r.cheapest.id).toBe('CTG-GUA-oneways')
    expect(r.types).toEqual(['ticket', 'oneways'])
  })
  it('sorts by the all in price when cheapest', () => {
    const rows = pairRows(inout, 'CPH', DEFAULT_FILTERS, 'cheapest')
    expect(rows.map((r) => r.key)).toEqual(['CUN|MEX', 'CTG|GUA'])
    expect(rows[1].best.id).toBe('CTG-GUA-oneways')
  })
  it('drops the United States and the hub nights on request', () => {
    expect(pairRows(inout, 'CPH', { ...DEFAULT_FILTERS, noUS: true }, 'best').map((r) => r.key)).toEqual(['CTG|GUA'])
    const none = pairRows(inout, 'CPH', { ...DEFAULT_FILTERS, maxHubNights: 0 }, 'best')
    expect(none[0].options.map((o) => o.id)).toEqual(['CTG-GUA-ticket'])
  })
  it('keeps to the cities picked', () => {
    expect(pairRows(inout, 'CPH', { ...DEFAULT_FILTERS, arrival: 'CUN' }, 'best').map((r) => r.key)).toEqual(['CUN|MEX'])
    expect(pairRows(inout, 'CPH', { ...DEFAULT_FILTERS, departure: 'GUA' }, 'best').map((r) => r.key)).toEqual(['CTG|GUA'])
  })
  it('ignores the stored filters the screen no longer shows', () => {
    const rows = pairRows(inout, 'CPH', { ...DEFAULT_FILTERS, maxPrice: 100, minRating: 10, maxHours: 1, type: 'madrid' } as unknown as PairFilters, 'best')
    expect(rows).toHaveLength(2)
  })
})

describe('return against one ways', () => {
  it('gives each ticket type its cheapest option and the difference to the cheapest', () => {
    const [r] = pairRows(inout, 'CPH', DEFAULT_FILTERS, 'best')
    expect(typeTiles(r.options).map((t) => [t.type, t.price, t.delta])).toEqual([
      ['ticket', 7400, 800],
      ['oneways', 6600, 0],
    ])
  })
  it('lists the one ways that mix for the two cities, by day', () => {
    const { ins, homes } = oneWaysFor(inout, 'CPH', 'CTG', 'GUA')
    expect(ins.map((w) => w.id)).toEqual(['I_o', 'I_o2'])
    expect(homes.map((w) => w.id)).toEqual(['H_o'])
  })
  it('prices a mix of two one ways all in', () => {
    const m = mixOption(inout, oIn2, oHome)
    expect(m.price_dkk).toBe(6000)
    expect(allIn(m)).toBe(6000)
    expect(m.entry).toBe('CTG')
  })
})

describe('the cities to fly in to and home from', () => {
  it('gives each city its best price, by region then price', () => {
    const rows = pairRows(inout, 'CPH', DEFAULT_FILTERS, 'best')
    expect(cityChoices(rows, 'in', inout.airports)).toEqual([
      { code: 'CTG', best: 6600, region: 'CO' },
      { code: 'CUN', best: 6100, region: 'MX' },
    ])
    expect(cityChoices(rows, 'home', inout.airports).map((c) => c.code)).toEqual(['GUA', 'MEX'])
  })
})

describe('the home airports', () => {
  it('gives a home its best pair and no price when the data has none from there', () => {
    expect(homeChoices(inout, ['CPH', 'BLL', 'HAM'])).toEqual([
      { code: 'CPH', best: 6100 },
      { code: 'BLL', best: 2000 },
      { code: 'HAM', best: null },
    ])
  })
})

describe('the tickets of a pair', () => {
  it('lists a return ticket once', () => {
    expect(ticketsOf(inout, tIn, tHome).map((t) => t.ticket.id)).toEqual(['TA'])
  })
  it('lists two one ways as two tickets, each with its own link', () => {
    const t = ticketsOf(inout, oIn, oHome)
    expect(t.map((x) => x.ticket.id)).toEqual(['TO1', 'TO2'])
  })
})

describe('what the pair shows as picked', () => {
  const rowOf = () => pairRows(inout, 'CPH', DEFAULT_FILTERS, 'best')[0]
  const none = { chosen: null, mixIn: null, mixHome: null }
  it('is the first option by the sort with nothing chosen', () => {
    expect(pickedOf(inout, rowOf(), none).option.id).toBe('CTG-GUA-ticket')
  })
  it('is the trip own option when the trip flies it', () => {
    expect(pickedOf(inout, rowOf(), { ...none, tripIn: 'I_o', tripHome: 'H_o' }).option.id).toBe('CTG-GUA-oneways')
  })
  it('is the option chosen over the trip own', () => {
    expect(pickedOf(inout, rowOf(), { ...none, chosen: 'CTG-GUA-ticket', tripIn: 'I_o', tripHome: 'H_o' }).option.id).toBe('CTG-GUA-ticket')
  })
  it('swaps a one way in for another of the same cities and prices the mix', () => {
    const p = pickedOf(inout, rowOf(), { ...none, chosen: 'CTG-GUA-oneways', mixIn: 'I_o2' })
    expect(p.wi.id).toBe('I_o2')
    expect(p.base.id).toBe('CTG-GUA-oneways')
    expect(allIn(p.option)).toBe(6000)
  })
  it('does not swap the ways of one ticket', () => {
    const p = pickedOf(inout, rowOf(), { ...none, chosen: 'CTG-GUA-ticket', mixIn: 'I_o2' })
    expect(p.wi.id).toBe('I_t')
  })
  it('ignores a swap to a way of other cities', () => {
    const p = pickedOf(inout, rowOf(), { ...none, chosen: 'CTG-GUA-oneways', mixIn: 'I_m' })
    expect(p.wi.id).toBe('I_o')
  })
  it('goes on as the option of the pair, and a mix the data does not hold goes on as no option', () => {
    const row = rowOf()
    expect(pickOptionId(row, pickedOf(inout, row, { ...none, chosen: 'CTG-GUA-oneways' }))).toBe('CTG-GUA-oneways')
    const mixed = pickedOf(inout, row, { ...none, chosen: 'CTG-GUA-oneways', mixIn: 'I_o2' })
    expect(mixed.option.id).not.toBe('CTG-GUA-oneways')
    expect(pickOptionId(row, mixed)).toBeNull()
  })
  it('shows a trip on its own mixed one ways', () => {
    const p = pickedOf(inout, rowOf(), { ...none, tripIn: 'I_o2', tripHome: 'H_o' })
    expect([p.wi.id, p.wh.id]).toEqual(['I_o2', 'H_o'])
  })
  it('swaps a trip on mixed one ways back to the way of the option', () => {
    const p = pickedOf(inout, rowOf(), { ...none, tripIn: 'I_o2', tripHome: 'H_o', mixIn: 'I_o' })
    expect([p.wi.id, p.wh.id, p.option.id]).toEqual(['I_o', 'H_o', 'CTG-GUA-oneways'])
  })
})

describe('the flags of a ticket', () => {
  it('reads a known flag in words with its tone', () => {
    expect(flagChip('us_transit')).toEqual({ label: 'Through the US', tone: 'warn' })
    expect(flagChip('price_verified_booking').tone).toBe('good')
  })
  it('reads a new flag as its own words', () => {
    expect(flagChip('red_eye_out')).toEqual({ label: 'Red eye out', tone: 'plain' })
  })
})

describe('heldSides', () => {
  const data: BookData = { inout: { airports: {}, ways: { I_o: oIn, H_o: oHome } }, map: { nodes: [] } }
  const journey = { wayIn: 'I_o', wayHome: 'H_o' } as Journey
  const booking = (w: Way) => ({ kind: 'flight', status: 'booked', from_code: w.from, to_code: w.to, depart: w.depart }) as Booking
  const bookedIn = booking(oIn)
  const bookedHome = booking(oHome)

  it('holds nothing without a journey or a booking', () => {
    expect(heldSides([bookedIn, bookedHome], data, null, oIn2, tHome, null)).toEqual({ in: false, home: false })
    expect(heldSides([], data, journey, oIn2, tHome, null)).toEqual({ in: false, home: false })
  })

  it('holds the side whose booked way the pick would replace', () => {
    expect(heldSides([bookedIn], data, journey, oIn2, tHome, null)).toEqual({ in: true, home: false })
    expect(heldSides([bookedIn], data, journey, oIn, tHome, null)).toEqual({ in: false, home: false })
  })

  it('holds both sides, and not a side being unlocked', () => {
    expect(heldSides([bookedIn, bookedHome], data, journey, oIn2, tHome, null)).toEqual({ in: true, home: true })
    expect(heldSides([bookedIn, bookedHome], data, journey, oIn2, tHome, 'in')).toEqual({ in: false, home: true })
    expect(heldSides([bookedIn, bookedHome], data, journey, oIn2, tHome, 'home')).toEqual({ in: true, home: false })
  })
})
