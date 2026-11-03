import { describe, expect, it } from 'vitest'
import type { Lodging, LodgingPrice, LodgingRoom, Way } from '../data/types'
import { schedule, type Hop, type Journey } from './journey'
import { plannedStays, plannedStaysDkk, priceFor, stayParts, type PlannedStay } from './stays'

// Made up places, rooms and prices only. A real name or price never goes in this file.

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'A', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
  total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'A'],
  tickets: [], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})
const wi = way({})
const wh = way({ id: 'H1', direction: 'home', from: 'C', to: 'CPH', depart: '2026-12-20T09:05', arrive: '2026-12-21T09:10' })
const bus = (from: string, to: string, date: string): Hop => ({ from, to, mode: 'bus', operator: null, hours: 8, price_dkk: 100, overnight: false, border: false, flight: null, date })

/** A, then B from the 5th until the leg on leaves on the 9th, then C until the flight home */
const trip = (intoB = '2026-12-05', stays?: PlannedStay[]): Journey => ({
  id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null,
  places: [
    { node: 'A', hop: null },
    { node: 'B', hop: bus('A', 'B', intoB), ...(stays ? { stays } : {}) },
    { node: 'C', hop: bus('B', 'C', '2026-12-09') },
  ],
})
const sched = (j: Journey) => schedule(j, wi, wh, 'C', (n) => n)

const price = (over: Partial<LodgingPrice>): LodgingPrice => ({
  id: 'p', room_id: 'R1', check_in: '2026-12-05', check_out: '2026-12-09', total_dkk: null, per_night_dkk: null, site: null, url: null,
  refundable: null, cancel_until: null, observed_at: '2026-11-03T10:00:00Z', ...over,
})
const room = (prices: LodgingPrice[], id = 'R1'): LodgingRoom => ({
  id, lodging_id: 'L1', name: 'TEST01 dorm', beds: 6, private: false, bathroom: 'shared', notes: null,
  created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z', prices: prices.map((p) => ({ ...p, room_id: id })),
})
const lodging = (rooms: LodgingRoom[], id = 'L1'): Lodging => ({
  id, place_id: 'B', name: 'TEST01 hostel', kind: 'hostel', photos: [], rating: null, reviews: null, rating_source: null, address: null,
  lat: null, lon: null, to_center_km: null, to_beach_km: null, tags: [], summary: null, notes: null, links: [], added_by: 'simon',
  hidden: false, created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z', rooms: rooms.map((r) => ({ ...r, lodging_id: id })),
})

const whole: PlannedStay = { lodging_id: 'L1', room_id: 'R1' }

describe('stayParts', () => {
  it('runs one part with no nights over every night of the stop', () => {
    const sp = sched(trip())
    expect(sp.places[1].days).toBe(4)
    expect(stayParts([whole], sp.places[1])).toEqual([{ stay: whole, first: '2026-12-05', last: '2026-12-08', nights: 4, fits: true }])
  })

  it('a part with no nights follows the stop when a leg before it moves', () => {
    const later = sched(trip('2026-12-06')).places[1]
    expect(stayParts([whole], later)).toEqual([{ stay: whole, first: '2026-12-06', last: '2026-12-08', nights: 3, fits: true }])
  })

  it('runs the parts in order from the first night, the last taking what remains', () => {
    const two = [{ ...whole, nights: 1 }, { lodging_id: 'L2', room_id: 'R2' }]
    expect(stayParts(two, sched(trip()).places[1]).map((p) => [p.first, p.last, p.nights, p.fits])).toEqual([
      ['2026-12-05', '2026-12-05', 1, true],
      ['2026-12-06', '2026-12-08', 3, true],
    ])
  })

  it('cuts a first part longer than the stop to the stop, and the part after it does not fit', () => {
    const two = [{ ...whole, nights: 6 }, { lodging_id: 'L2', room_id: 'R2' }]
    const parts = stayParts(two, sched(trip()).places[1])
    expect(parts.map((p) => [p.first, p.last, p.nights, p.fits])).toEqual([
      ['2026-12-05', '2026-12-08', 4, true],
      ['2026-12-09', '2026-12-08', 0, false],
    ])
  })

  it('gives every part of a stop you pass through 0 nights, and nothing throws', () => {
    const through = { ...sched(trip()).places[1], days: 0, outDay: '2026-12-05' }
    expect(stayParts([{ ...whole, nights: 2 }, whole], through).map((p) => [p.nights, p.fits])).toEqual([[0, false], [0, false]])
    expect(stayParts([], through)).toEqual([])
  })
})

describe('priceFor', () => {
  it('is exact when a price is for those very nights', () => {
    const r = room([price({ id: 'a', total_dkk: 1240 })])
    expect(priceFor(r, '2026-12-05', 4)).toEqual({ total: 1240, exact: true })
  })

  it('works a total out of a price per night', () => {
    expect(priceFor(room([price({ per_night_dkk: 310 })]), '2026-12-05', 4)).toEqual({ total: 1240, exact: true })
  })

  it('takes a price that covers only some of the nights as the nearest, with its own dates, not as a match', () => {
    const r = room([price({ check_out: '2026-12-07', total_dkk: 600 })])
    expect(priceFor(r, '2026-12-05', 4)).toEqual({ total: 600, exact: false, check_in: '2026-12-05', check_out: '2026-12-07' })
  })

  it('takes the price whose dates are nearest the nights when none match', () => {
    const r = room([
      price({ id: 'far', check_in: '2027-01-10', check_out: '2027-01-14', total_dkk: 900 }),
      price({ id: 'near', check_in: '2026-12-06', check_out: '2026-12-10', total_dkk: 1300 }),
    ])
    expect(priceFor(r, '2026-12-05', 4)).toEqual({ total: 1300, exact: false, check_in: '2026-12-06', check_out: '2026-12-10' })
  })

  it('is null for a room with no prices or no nights', () => {
    expect(priceFor(room([]), '2026-12-05', 4)).toBeNull()
    expect(priceFor(room([price({ total_dkk: 1240 })]), '2026-12-05', 0)).toBeNull()
  })
})

describe('plannedStays', () => {
  const exact = [lodging([room([price({ total_dkk: 1240 }), price({ id: 'b', check_in: '2026-12-06', total_dkk: 900 })])])]

  it('counts an exact price as it is, and looks the price up again for the new dates when a leg before moves', () => {
    expect(plannedStaysDkk(trip(undefined, [whole]), sched(trip(undefined, [whole])), exact)).toBe(1240)
    const moved = trip('2026-12-06', [whole])
    expect(plannedStaysDkk(moved, sched(moved), exact)).toBe(900)
  })

  it('counts the nearest price per night times the nights when no price is for those nights', () => {
    const near = [lodging([room([price({ check_out: '2026-12-07', total_dkk: 600 })])])]
    const j = trip(undefined, [whole])
    expect(plannedStays(j, sched(j), near)).toEqual({ dkk: 1200, unknown: 0 })
  })

  it('counts a part with no price as unknown, never as 0', () => {
    const j = trip(undefined, [{ ...whole, nights: 2 }, { lodging_id: 'L1', room_id: 'gone' }])
    const priced = [lodging([room([price({ check_out: '2026-12-07', total_dkk: 600 })])])]
    expect(plannedStays(j, sched(j), priced)).toEqual({ dkk: 600, unknown: 1 })
    expect(plannedStays(j, sched(j), [])).toEqual({ dkk: 0, unknown: 2 })
  })

  it('adds nothing for a part that does not fit and nothing for a trip with no planned stays', () => {
    const j = trip(undefined, [{ ...whole, nights: 6 }, { lodging_id: 'L2', room_id: 'R2' }])
    expect(plannedStays(j, sched(j), exact)).toEqual({ dkk: 310 * 4, unknown: 0 })
    expect(plannedStays(trip(), sched(trip()), exact)).toEqual({ dkk: 0, unknown: 0 })
  })
})
