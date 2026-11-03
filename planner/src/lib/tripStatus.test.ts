import { describe, expect, it } from 'vitest'
import type { Booking, Way } from '../data/types'
import type { BookData } from './booked'
import type { Hop, Journey, Schedule, Totals } from './journey'
import { costItems, costParts, legAction, legCounts, nextOpen, nowIn, stopEnd, ticketSplit, tripCost, tripLegs, type LegState } from './tripStatus'

// Made up rows only. A real reference, price or name never goes in this file.
const row = (over: Partial<Booking>): Booking => ({
  id: 'b1', kind: 'flight', status: 'booked', from_code: null, to_code: null, depart: null, arrive: null,
  place_id: null, check_in: null, check_out: null, lodging_id: null, room_id: null, reference: 'TEST01', seller: null,
  url: null, price_dkk: null, price: null, currency: null, refundable: null, changeable: null, change_until: null,
  cancel_until: null, cabin_bag: null, checked_bag: null, segments: null, travellers: 1, trip_id: null, ticket: null,
  source: 'manual', notes: null, attachments: [], created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
  ...over,
})

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'CTG', depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10',
  total_hours: 18, flying_hours: 16, flights: 2, hub_nights: 0, changes: 1, us_transit: false, airports: ['CPH', 'CTG'],
  tickets: [], price_dkk: 0, extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})

const wi = way({})
const wh = way({ id: 'H1', direction: 'home', from: 'GUA', to: 'CPH', depart: '2026-12-16T12:00', arrive: '2026-12-17T14:00' })

const data: BookData = {
  inout: {
    airports: {
      CPH: { name: 'Copenhagen', country: 'DK', lat: 0, lon: 0, region: null, utc_offset: 1, home: true },
      GUA: { name: 'Guatemala City', country: 'GT', lat: 0, lon: 0, region: 'GT', utc_offset: -6, home: false, map_node: 'GUA' },
    },
    ways: { I1: wi, H1: wh },
  },
  map: { nodes: [{ id: 'CTG', iata: 'CTG' }, { id: 'SMR', iata: 'SMR' }, { id: 'TAY', iata: null }, { id: 'GUA', iata: 'GUA' }] },
}

const hop = (from: string, to: string, over: Partial<Hop> = {}): Hop => ({
  from, to, mode: 'flight', operator: null, hours: 2, price_dkk: 500, overnight: false, border: false, flight: null, ...over,
})

// CTG 2 nights, SMR 3 nights, TAY 1 night, GUA 4 nights then 4 free nights up to the flight home on the 16th
const journey: Journey = {
  id: 't', name: 'Test', wayIn: 'I1', wayHome: 'H1', optionId: null, savedAt: '',
  places: [
    { node: 'CTG', hop: null },
    { node: 'SMR', hop: hop('CTG', 'SMR', { date: '2026-12-04', price_dkk: 400 }) },
    { node: 'TAY', hop: hop('SMR', 'TAY', { mode: 'bus', price_dkk: null, date: '2026-12-07' }) },
    { node: 'GUA', hop: hop('TAY', 'GUA', { date: '2026-12-08', price_dkk: 1200 }) },
  ],
}

const sp = (node: string, inDay: string, days: number, outDay: string) => ({ node, arrive: null, depart: null, days, inDay, outDay, exact: true })
const sched: Schedule = {
  places: [sp('CTG', '2026-12-02', 2, '2026-12-04'), sp('SMR', '2026-12-04', 3, '2026-12-07'), sp('TAY', '2026-12-07', 1, '2026-12-08'), sp('GUA', '2026-12-08', 8, '2026-12-16')],
  firstDay: '2026-12-02', homeDepart: '2026-12-16T12:00', totalDays: 14, free: 4, warnings: [],
}
sched.places[3].days = 4

describe('tripLegs', () => {
  it('lists the way in, every leg and the way home in order, with nothing booked', () => {
    const legs = tripLegs(data, journey, sched, wi, wh, [])
    expect(legs.map((l) => l.key)).toEqual(['in', 1, 2, 3, 'home'])
    expect(legs.map((l) => l.day)).toEqual(['2026-12-02', '2026-12-04', '2026-12-07', '2026-12-08', '2026-12-16'])
    expect(legs.every((l) => !l.booked)).toBe(true)
    expect(legs[2].fam).toBe('ground')
  })

  it('takes a booked leg with its price paid, and keeps the estimate of one that is not', () => {
    const legs = tripLegs(data, journey, sched, wi, wh, [row({ from_code: 'CTG', to_code: 'SMR', depart: '2026-12-04T08:00', price_dkk: 350 })])
    expect(legs[1]).toMatchObject({ booked: true, paid: true, price: 350 })
    expect(legs[3]).toMatchObject({ booked: false, paid: false, price: 1200 })
  })

  it('keeps the estimate of a booked leg whose price is not filled in', () => {
    const legs = tripLegs(data, journey, sched, wi, wh, [row({ from_code: 'CTG', to_code: 'SMR', depart: '2026-12-04T08:00' })])
    expect(legs[1]).toMatchObject({ booked: true, paid: false, price: 400 })
  })

  it('marks a flight leg with no flight picked, and never a bus or a way', () => {
    const legs = tripLegs(data, journey, sched, wi, wh, [])
    expect(legs.map((l) => l.unpicked)).toEqual([false, true, false, true, false])
  })

  it('books a way on its ends and its day', () => {
    const legs = tripLegs(data, journey, sched, wi, wh, [row({ from_code: 'CPH', to_code: 'CTG', depart: '2026-12-02T09:55', price_dkk: 4000 })])
    expect(legs[0]).toMatchObject({ key: 'in', booked: true, paid: true, price: 4000 })
  })
})

const leg = (key: LegState['key'], over: Partial<LegState> = {}): LegState => ({
  key, fam: 'flight', from: 'A', to: 'B', day: '2026-12-02', booked: false, unpicked: false, price: null, paid: false, ...over,
})

describe('legAction', () => {
  it('says Pick flight on a flight with none picked, Book on any other open leg, and nothing on a booked one', () => {
    expect(legAction(leg(1, { unpicked: true }))).toBe('Pick flight')
    expect(legAction(leg(2, { fam: 'ground' }))).toBe('Book')
    expect(legAction(leg('in'))).toBe('Book')
    expect(legAction(leg(3, { booked: true }))).toBeNull()
  })
})

describe('legCounts and nextOpen', () => {
  const legs = [leg('in', { booked: true }), leg(1), leg(2, { booked: true }), leg(3), leg('home')]

  it('counts the booked legs and the open ones', () => {
    expect(legCounts(legs)).toEqual({ booked: 2, open: 3 })
  })

  it('goes to the first open leg, then the one after the last shown, and round again', () => {
    expect(nextOpen(legs, null)).toBe(1)
    expect(nextOpen(legs, 1)).toBe(3)
    expect(nextOpen(legs, 3)).toBe('home')
    expect(nextOpen(legs, 'home')).toBe(1)
  })

  it('has none to go to when all is booked', () => {
    expect(nextOpen([leg('in', { booked: true })], null)).toBeNull()
  })
})

const totals = (over: Partial<Totals> = {}): Totals => ({
  tickets_dkk: 0, regional_flights_dkk: 0, regional_unknown: 0, cabin_bag_dkk: 0, checked_bag_dkk: 0, hub_nights: 0, hub_stay_dkk: 0,
  ground_dkk: 0, ground_unknown: 0, stays_booked_dkk: 0, stays_planned_dkk: 0, stays_unknown: 0, flights: 0, air_hours: 0,
  days_per_country: {}, hub_stops: [], ...over,
})

describe('costParts', () => {
  const legs = [
    leg('in', { booked: true, paid: true, price: 4000 }),
    leg(1, { booked: true, paid: true, price: 350 }),
    leg(2, { fam: 'ground' }),
    leg(3, { price: 1200 }),
    leg(4, { fam: 'boat', price: 300 }),
    leg('home'),
  ]

  it('splits each category into paid, estimated and not priced, and hides the empty ones', () => {
    const parts = costParts({ legs, tickets: { paid: 4000, quoted: 3000 }, t: totals({ stays_booked_dkk: 900, stays_planned_dkk: 2100, stays_unknown: 1, cabin_bag_dkk: null }) })
    expect(parts.map((p) => p.key)).toEqual(['long', 'regional', 'ground', 'stays', 'cabin'])
    expect(parts.find((p) => p.key === 'long')).toMatchObject({ paid: 4000, estimated: 3000, unpriced: 0 })
    expect(parts.find((p) => p.key === 'regional')).toMatchObject({ paid: 350, estimated: 1200, unpriced: 0 })
    expect(parts.find((p) => p.key === 'ground')).toMatchObject({ paid: 0, estimated: 300, unpriced: 1 })
    expect(parts.find((p) => p.key === 'stays')).toMatchObject({ paid: 900, estimated: 2100, unpriced: 1 })
    expect(parts.find((p) => p.key === 'cabin')).toMatchObject({ paid: 0, estimated: 0, unpriced: 1 })
  })

  it('shows the hub stays only with nights at a hub, and the checked bags apart as optional', () => {
    const parts = costParts({ legs: [], tickets: { paid: 0, quoted: 0 }, t: totals({ hub_nights: 1, hub_stay_dkk: 450, checked_bag_dkk: 600 }) })
    expect(parts).toEqual([
      { key: 'hub', label: 'Hub stays', paid: 0, estimated: 450, unpriced: 0 },
      { key: 'checked', label: 'Checked bags', paid: 0, estimated: 600, unpriced: 0, optional: true },
    ])
  })

  it('sums the trip without the optional parts', () => {
    const parts = costParts({ legs, tickets: { paid: 4000, quoted: 3000 }, t: totals({ stays_booked_dkk: 900, stays_planned_dkk: 2100, stays_unknown: 1, cabin_bag_dkk: null, checked_bag_dkk: 600 }) })
    expect(tripCost(parts)).toEqual({ total: 11850, paid: 5250, estimated: 6600, unpriced: 3 })
  })
})

describe('ticketSplit', () => {
  const tk = (id: string, price_dkk: number) => ({ id, price_dkk, cabin_bag_fee_dkk: 0, checked_bag_fee_dkk: 0 })
  const inout = { tickets: { R: tk('R', 6000), O: tk('O', 2500) } } as never
  const both = { ...wi, tickets: ['R'] }
  const back = { ...wh, tickets: ['R'] }

  it('quotes a shared ticket once', () => {
    expect(ticketSplit(inout, [leg('in'), leg('home')], both, back)).toEqual({ paid: 0, quoted: 6000 })
  })

  it('takes what a booked way paid and quotes the other', () => {
    const legs = [leg('in', { booked: true, paid: true, price: 3100 }), leg('home')]
    expect(ticketSplit(inout, legs, { ...wi, tickets: ['O'] }, { ...wh, tickets: ['O'] })).toEqual({ paid: 3100, quoted: 2500 })
  })
})

describe('costItems', () => {
  it('lists the long haul as one item and the legs with a price, the biggest first', () => {
    const legs = [leg('in', { booked: true, paid: true, price: 4000 }), leg(1, { booked: true, paid: true, price: 350 }), leg(2, { fam: 'ground' }), leg(3, { price: 1200 }), leg('home')]
    const items = costItems(legs, { paid: 4000, quoted: 3000 }, (l) => `${l.key}`, 3)
    expect(items).toEqual([
      { key: 'in', fam: 'flight', label: 'Long haul', dkk: 7000, paid: false },
      { key: 3, fam: 'flight', label: '3', dkk: 1200, paid: false },
      { key: 1, fam: 'flight', label: '1', dkk: 350, paid: true },
    ])
  })
})

describe('nowIn', () => {
  const legs = tripLegs(data, journey, sched, wi, wh, [])
  const ends = { start: '2026-12-02', end: '2026-12-17' }

  it('is nothing before the trip or after it', () => {
    expect(nowIn(sched, legs, ends, '2026-12-01')).toBeNull()
    expect(nowIn(sched, legs, ends, '2026-12-18')).toBeNull()
  })

  it('finds the stop of tonight with its nights left and the next leg', () => {
    expect(nowIn(sched, legs, ends, '2026-12-05')).toEqual({ at: 1, nightsLeft: 2, next: 2 })
  })

  it('on a day a leg leaves, has that leg next and the stop it goes to', () => {
    expect(nowIn(sched, legs, ends, '2026-12-07')).toEqual({ at: 2, nightsLeft: 1, next: 2 })
  })

  it('finds the free nights after the last stop', () => {
    expect(nowIn(sched, legs, ends, '2026-12-14')).toEqual({ at: 'free', nightsLeft: 2, next: 'home' })
  })

  it('is on the move on the day of the flight home', () => {
    expect(nowIn(sched, legs, ends, '2026-12-16')).toEqual({ at: null, nightsLeft: 0, next: 'home' })
  })

  it('ends a stop on its last night, not at the flight home', () => {
    expect(stopEnd(sched.places[3])).toBe('2026-12-12')
  })
})
