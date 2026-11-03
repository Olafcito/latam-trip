import { describe, expect, it } from 'vitest'
import type { Booking, Way } from '../data/types'
import { bookedCount, bookedElsewhere, bookingOn, endsMatch, lockedLegs, paidPrice, stayOn, wayBooking, type BookData } from './booked'
import type { Hop, Journey, Schedule } from './journey'

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

const node = (id: string, iata: string | null) => ({ id, iata })

const data: BookData = {
  inout: {
    airports: {
      CPH: { name: 'Copenhagen', country: 'DK', lat: 0, lon: 0, region: null, utc_offset: 1, home: true },
      GUA: { name: 'Guatemala City', country: 'GT', lat: 0, lon: 0, region: 'GT', utc_offset: -6, home: false, map_node: 'guatemala' },
    },
    ways: {
      I1: way({}),
      H1: way({ id: 'H1', direction: 'home', from: 'GUA', to: 'CPH', depart: '2027-02-04T12:00', arrive: '2027-02-05T14:00' }),
    },
  },
  map: {
    nodes: [
      // an older place with the same iata comes first, and the place whose id is the code still wins
      node('cartagena-old', 'CTG'), node('CTG', 'CTG'),
      node('san-andres', 'ADZ'), node('SMR', 'SMR'), node('guatemala', null),
    ],
  },
}

const hop = (from: string, to: string, over: Partial<Hop> = {}): Hop => ({
  from, to, mode: 'flight', operator: null, hours: 2, price_dkk: 500, overnight: false, border: false, flight: null, ...over,
})

describe('endsMatch', () => {
  it('maps an inner hop airport code to its place by the iata of the places', () => {
    expect(endsMatch(data, row({ from_code: 'ADZ', to_code: 'SMR' }), 'san-andres', 'SMR')).toBe(true)
  })

  it('lets the place whose id is the code win over another place with that iata', () => {
    expect(endsMatch(data, row({ from_code: 'CTG', to_code: 'ADZ' }), 'CTG', 'san-andres')).toBe(true)
    expect(endsMatch(data, row({ from_code: 'CTG', to_code: 'ADZ' }), 'cartagena-old', 'san-andres')).toBe(false)
  })

  it('falls back to the map node of the airport, then to the code itself', () => {
    expect(endsMatch(data, row({ from_code: 'GUA', to_code: 'CPH' }), 'guatemala', 'CPH')).toBe(true)
    expect(endsMatch(data, row({ from_code: 'san-andres', to_code: 'SMR' }), 'san-andres', 'SMR')).toBe(true)
  })

  it('needs both ends, in their order', () => {
    expect(endsMatch(data, row({ from_code: 'SMR', to_code: 'ADZ' }), 'san-andres', 'SMR')).toBe(false)
    expect(endsMatch(data, row({ from_code: 'ADZ', to_code: null }), 'san-andres', 'SMR')).toBe(false)
  })
})

describe('bookingOn and bookedElsewhere', () => {
  const hopRow = row({ id: 'hop', from_code: 'ADZ', to_code: 'SMR', depart: '2026-12-08T06:15' })
  const leg = { from: 'san-andres', to: 'SMR', day: '2026-12-08' }

  it('finds a booked row with matching ends that leaves on the leg day', () => {
    expect(bookingOn([hopRow], data, leg)).toBe(hopRow)
    expect(bookedElsewhere([hopRow], data, leg)).toBeNull()
  })

  it('takes the day from the first ten characters of depart, a date alone too', () => {
    const dateOnly = row({ ...hopRow, depart: '2026-12-08' })
    expect(bookingOn([dateOnly], data, leg)).toBe(dateOnly)
  })

  it('a booking a day off is booked elsewhere and not on the leg', () => {
    const off = { ...leg, day: '2026-12-07' }
    expect(bookingOn([hopRow], data, off)).toBeNull()
    expect(bookedElsewhere([hopRow], data, off)).toBe(hopRow)
  })

  it('a row with other ends matches neither', () => {
    const other = row({ from_code: 'CTG', to_code: 'ADZ', depart: '2026-12-08T06:15' })
    expect(bookingOn([other], data, leg)).toBeNull()
    expect(bookedElsewhere([other], data, leg)).toBeNull()
  })

  it('a cancelled row matches nothing', () => {
    const gone = row({ ...hopRow, status: 'cancelled' })
    expect(bookingOn([gone], data, leg)).toBeNull()
    expect(bookedElsewhere([gone], data, { ...leg, day: '2026-12-07' })).toBeNull()
  })

  it('prefers the row on the leg day when another row has the same ends', () => {
    const later = row({ ...hopRow, id: 'later', depart: '2026-12-09T06:15' })
    expect(bookingOn([later, hopRow], data, leg)).toBe(hopRow)
    expect(bookedElsewhere([later, hopRow], data, leg)).toBeNull()
  })

  it('a stay row is never a leg', () => {
    const stay = row({ kind: 'stay', from_code: 'ADZ', to_code: 'SMR', depart: '2026-12-08' })
    expect(bookingOn([stay], data, leg)).toBeNull()
  })
})

describe('stayOn', () => {
  const stay = row({ id: 's1', kind: 'stay', place_id: 'SMR', check_in: '2026-12-08', check_out: '2026-12-11' })
  const nights = { first: '2026-12-08', last: '2026-12-12' }

  it('finds a booked stay whose nights fall inside the stop', () => {
    expect(stayOn([stay], 'SMR', nights)).toBe(stay)
    expect(stayOn([stay], 'SMR', { first: '2026-12-08', last: '2026-12-10' })).toBe(stay)
  })

  it('misses a stay at another place or one that runs past the stop', () => {
    expect(stayOn([stay], 'CTG', nights)).toBeNull()
    expect(stayOn([stay], 'SMR', { first: '2026-12-09', last: '2026-12-12' })).toBeNull()
    expect(stayOn([stay], 'SMR', { first: '2026-12-08', last: '2026-12-09' })).toBeNull()
  })

  it('drops a cancelled stay and a leg row', () => {
    expect(stayOn([row({ ...stay, status: 'cancelled' })], 'SMR', nights)).toBeNull()
    expect(stayOn([row({ ...stay, kind: 'flight' })], 'SMR', nights)).toBeNull()
  })
})

describe('paidPrice', () => {
  it('the first row of a ticket group pays and the second pays 0', () => {
    const out = row({ id: 'r-b', ticket: 'T', price_dkk: 8000, depart: '2026-12-02T09:55', from_code: 'CPH', to_code: 'CTG' })
    const back = row({ id: 'r-a', ticket: 'T', price_dkk: 0, depart: '2027-02-04T12:00', from_code: 'GUA', to_code: 'CPH' })
    const list = [back, out]
    expect(paidPrice(list, out)).toBe(8000)
    expect(paidPrice(list, back)).toBe(0)
    expect(paidPrice(list, out) + paidPrice(list, back)).toBe(8000)
  })

  it('a group that leaves at the same moment goes by id', () => {
    const a = row({ id: 'a', ticket: 'T', price_dkk: 700, depart: '2026-12-08' })
    const b = row({ id: 'b', ticket: 'T', price_dkk: 700, depart: '2026-12-08' })
    expect([paidPrice([b, a], a), paidPrice([b, a], b)]).toEqual([700, 0])
  })

  it('a row without a ticket pays its own price, and no price is 0', () => {
    expect(paidPrice([], row({ price_dkk: 900 }))).toBe(900)
    expect(paidPrice([], row({ price_dkk: null }))).toBe(0)
  })
})

const j: Journey = {
  id: 'j1', name: 'Test', wayIn: 'I1', wayHome: 'H1', optionId: null,
  places: [
    { node: 'CTG', hop: null },
    { node: 'san-andres', hop: hop('CTG', 'san-andres', { date: '2026-12-05' }) },
    { node: 'SMR', hop: hop('san-andres', 'SMR') },
    { node: 'guatemala', hop: hop('SMR', 'guatemala') },
  ],
}
const at = (node: string, inDay: string, outDay: string) => ({ node, arrive: null, depart: null, days: 0, inDay, outDay, exact: false })
const sched: Schedule = {
  places: [at('CTG', '2026-12-02', '2026-12-05'), at('san-andres', '2026-12-05', '2026-12-08'), at('SMR', '2026-12-08', '2026-12-20'), at('guatemala', '2026-12-20', '2027-02-04')],
  firstDay: '2026-12-02', homeDepart: '2027-02-04T12:00', totalDays: 64, free: 0, warnings: [],
}

describe('bookedCount', () => {
  it('counts the booked legs, ways and stays of a trip', () => {
    const list = [
      row({ id: 'in', from_code: 'CPH', to_code: 'CTG', depart: '2026-12-02T09:55', ticket: 'T' }),
      row({ id: 'home', from_code: 'GUA', to_code: 'CPH', depart: '2027-02-04T12:00', ticket: 'T' }),
      row({ id: 'h1', from_code: 'CTG', to_code: 'ADZ', depart: '2026-12-05T10:00' }),
      // on the estimated day of the leg
      row({ id: 'h2', from_code: 'ADZ', to_code: 'SMR', depart: '2026-12-08T06:15' }),
      row({ id: 's1', kind: 'stay', place_id: 'SMR', check_in: '2026-12-08', check_out: '2026-12-12' }),
    ]
    expect(bookedCount(list, data, j, sched)).toBe(5)
  })

  it('leaves out a row a day off, a cancelled row and a stay past the stop', () => {
    const list = [
      row({ id: 'off', from_code: 'ADZ', to_code: 'SMR', depart: '2026-12-09T06:15' }),
      row({ id: 'gone', from_code: 'CTG', to_code: 'ADZ', depart: '2026-12-05T10:00', status: 'cancelled' }),
      row({ id: 'long', kind: 'stay', place_id: 'SMR', check_in: '2026-12-08', check_out: '2026-12-22' }),
    ]
    expect(bookedCount(list, data, j, sched)).toBe(0)
    expect(bookedCount([], data, j, sched)).toBe(0)
  })
})

describe('lockedLegs', () => {
  it('holds the legs booked on the day they show, by their place index', () => {
    const list = [
      row({ id: 'h1', from_code: 'CTG', to_code: 'ADZ', depart: '2026-12-05T10:00' }),
      // on the estimated day of the leg
      row({ id: 'h2', from_code: 'SMR', to_code: 'GUA', depart: '2026-12-20T08:00' }),
    ]
    expect([...lockedLegs(list, data, j, sched)]).toEqual([1, 3])
  })

  it('locks nothing for a cancelled row, a row a day off, a way or a stay', () => {
    const list = [
      row({ id: 'gone', from_code: 'CTG', to_code: 'ADZ', depart: '2026-12-05T10:00', status: 'cancelled' }),
      row({ id: 'off', from_code: 'ADZ', to_code: 'SMR', depart: '2026-12-09T06:15' }),
      row({ id: 'in', from_code: 'CPH', to_code: 'CTG', depart: '2026-12-02T09:55' }),
      row({ id: 's1', kind: 'stay', place_id: 'SMR', check_in: '2026-12-08', check_out: '2026-12-12' }),
    ]
    expect(lockedLegs(list, data, j, sched).size).toBe(0)
    expect(lockedLegs([], data, j, sched).size).toBe(0)
  })
})

describe('wayBooking', () => {
  it('finds the booked row of a way on its ends and the day it leaves', () => {
    const home = row({ id: 'home', from_code: 'GUA', to_code: 'CPH', depart: '2027-02-04T12:00' })
    expect(wayBooking([home], data, data.inout.ways.H1)).toBe(home)
    expect(wayBooking([home], data, data.inout.ways.I1)).toBeNull()
    expect(wayBooking([row({ ...home, status: 'cancelled' })], data, data.inout.ways.H1)).toBeNull()
  })
})
