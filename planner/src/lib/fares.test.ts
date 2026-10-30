import { describe, expect, it } from 'vitest'
import type { Way } from '../data/types'
import { fareNotes, fareRows, quoteFlight, sameFlight, seller, sortFares, stopsOf, timed } from './fares'
import { schedule, type Hop, type Journey } from './journey'
import type { PairQuote } from './prices'

const q = (over: Partial<PairQuote> = {}): PairQuote => ({ p: 1000, d: '06:10', a: '09:40', h: 3.5, c: ['Avianca'], s: 0, src: 'momondo', at: '2026-10-29T10:00Z', ...over })
const flight = (over: Partial<PairQuote> = {}) => quoteFlight(q(over), 'VVI', 'SJO', '2026-12-28')
const name = (code: string) => ({ LIM: 'Lima', PTY: 'Panama City' })[code] ?? code

describe('a quote as a flight', () => {
  it('lands on the day its next-day count says', () => {
    const f = flight({ d: '22:10', a: '05:05', n: 1 })
    expect([f.depart, f.arrive]).toEqual(['2026-12-28T22:10', '2026-12-29T05:05'])
    expect(timed(f)).toBe(true)
  })

  it('keeps the stops, the waits, the site and the warnings', () => {
    const f = flight({ s: 1, v: ['LIM'], w: [5.83], ag: 'Mytrip', o: true, f: ['self_transfer'] })
    expect([f.via, f.layover_h, f.site, f.overnight_layover, f.self_transfer, f.airport_change]).toEqual([['LIM'], [5.83], 'Mytrip', true, true, false])
  })

  it('counts a stop it does not know the airport of', () => {
    const f = flight({ s: 1 })
    expect([f.via, stopsOf(f)]).toEqual([[], 1])
  })

  it('knows when it has no times', () => {
    expect(timed(flight({ d: null, a: null }))).toBe(false)
  })
})

describe('one flight seen twice', () => {
  it('is the same flight with another id, not with another time or airline', () => {
    const f = flight()
    expect(sameFlight(f, { ...f, quote_id: 'momondo-123', price_dkk: 1400 })).toBe(true)
    expect(sameFlight(f, flight({ d: '07:00' }))).toBe(false)
    expect(sameFlight(f, flight({ c: ['Copa'] }))).toBe(false)
  })
})

describe('where a flight is sold', () => {
  it('names the site, the airline itself in plain words, or else where the price was seen', () => {
    expect(seller(flight({ ag: 'Mytrip' }))).toBe('Mytrip')
    expect(seller(flight({ ag: 'Flyselskab' }))).toBe('The airline')
    expect(seller(flight({ src: 'expedia' }))).toBe('Expedia')
  })
})

describe('the rows of a day', () => {
  it('shows one flight seen at several sites once, at its cheapest', () => {
    const rows = fareRows([q({ p: 1200, ag: 'Kiwi.com' }), q({ p: 1000, ag: 'Mytrip' }), q({ p: 1300, ag: 'Trip.com' }), q({ p: 1250, ag: 'Kiwi.com' })], 'VVI', 'SJO', '2026-12-28')
    expect(rows.length).toBe(1)
    expect([rows[0].flight.price_dkk, rows[0].flight.site, rows[0].others]).toEqual([1000, 'Mytrip', ['Kiwi.com', 'Trip.com']])
  })

  it('keeps flights apart that differ in time, airline or stops', () => {
    const rows = fareRows([q(), q({ d: '07:00' }), q({ c: ['Copa'] }), q({ s: 1 })], 'VVI', 'SJO', '2026-12-28')
    expect(rows.length).toBe(4)
  })

  it('takes the stops from a dearer sighting of the same flight', () => {
    const [row] = fareRows([q({ p: 900, s: 1 }), q({ p: 950, s: 1, v: ['LIM'], w: [2.5] })], 'VVI', 'SJO', '2026-12-28')
    expect([row.flight.price_dkk, row.flight.via, row.flight.layover_h]).toEqual([900, ['LIM'], [2.5]])
  })

  it('does not merge rows that have no times', () => {
    expect(fareRows([q({ d: null, a: null }), q({ p: 1100, d: null, a: null })], 'VVI', 'SJO', '2026-12-28').length).toBe(2)
  })

  it('sorts by price, by length and by the time it leaves, rows without times last', () => {
    const rows = fareRows([q({ p: 900, d: '12:00', h: 9 }), q({ p: 1000, d: '05:30', h: 3 }), q({ p: 800, d: null, a: null, h: 1 })], 'VVI', 'SJO', '2026-12-28')
    const order = (by: 'cheap' | 'fast' | 'early') => sortFares(rows, by).map((r) => r.flight.price_dkk)
    expect(order('cheap')).toEqual([800, 900, 1000])
    expect(order('fast')).toEqual([1000, 900, 800])
    expect(order('early')).toEqual([1000, 900, 800])
  })
})

describe('what a flight changes around it', () => {
  const texts = (f = flight(), next: string | null = null) => fareNotes(f, name, next).map((n) => n.text)

  it('says nothing about an ordinary flight', () => expect(texts()).toEqual([]))

  it('names where a long wait or a night at a stop falls', () => {
    expect(texts(flight({ v: ['PTY', 'LIM'], w: [1.5, 5.83] }))).toEqual(['Long wait in Lima'])
    expect(texts(flight({ v: ['LIM'], w: [9], o: true }))).toEqual(['A night in Lima'])
  })

  it('names a planned stopover and its nights instead of warning about the wait', () => {
    expect(texts(flight({ v: ['PTY'], w: [26.95], o: true, f: ['stopover'] }))).toEqual(['Stopover in Panama City, 1 night'])
    expect(texts(flight({ v: ['PTY'], w: [50], o: true, f: ['stopover'] }))).toEqual(['Stopover in Panama City, 2 nights'])
    expect(texts(flight({ v: ['LIM', 'PTY'], w: [1.5, 26.95], f: ['stopover'] }))).toEqual(['Stopover in Panama City, 1 night'])
    expect(texts(flight({ v: ['PTY'], f: ['stopover'] }))).toEqual(['Stopover in Panama City'])
    expect(texts(flight({ v: ['LIM'], w: [3.9] }))).toEqual([])
  })

  it('reads the hour it leaves and lands, so a stay can be weighed', () => {
    expect(texts(flight({ d: '01:10', a: '07:05' }))).toEqual(['Leaves at night'])
    expect(texts(flight({ d: '18:00', a: '23:30' }))).toEqual(['Lands at night'])
    expect(texts(flight({ d: '05:30', a: '15:55' }))).toEqual([])
  })

  it('warns of self transfers and airport changes', () => {
    expect(texts(flight({ f: ['airport_change', 'self_transfer'] }))).toEqual(['Self transfer, you check in again', 'Changes airport on the way'])
  })

  it('marks a flight that lands after the next leg leaves', () => {
    const f = flight({ d: '22:10', a: '05:05', n: 1 })
    expect(fareNotes(f, name, '2026-12-28')[0]).toEqual({ text: 'Lands after the next leg leaves', bad: true })
    expect(fareNotes(f, name, '2026-12-29').some((n) => n.bad)).toBe(false)
  })
})

describe('a picked flight on the schedule', () => {
  const way = (over: Partial<Way>): Way => ({
    id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'A', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
    total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'A'],
    tickets: [], price_dkk: 0,
    extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
    score: 5, timeline: [], ...over,
  })
  const wi = way({})
  const wh = way({ id: 'H1', direction: 'home', from: 'B', to: 'CPH', depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10' })
  const hop = (over: Partial<Hop>): Hop => ({ from: 'A', to: 'B', mode: 'flight', operator: null, hours: 3, price_dkk: 500, overnight: false, border: false, flight: null, ...over })
  const trip = (h: Hop): Journey => ({ id: 'j', name: '', wayIn: 'I1', wayHome: 'H1', optionId: null, places: [{ node: 'A', hop: null }, { node: 'B', hop: h }] })

  it('sets the leg to the day and the time it flies, with no warning about another day', () => {
    const f = quoteFlight(q({ d: '22:10', a: '05:05', n: 1 }), 'A', 'B', '2026-12-10')
    const s = schedule(trip(hop({ flight: f, date: '2026-12-10' })), wi, wh, 'B', (n) => n)
    expect(s.warnings).toEqual([])
    expect([s.places[0].depart, s.places[1].arrive, s.places[1].inDay]).toEqual(['2026-12-10T22:10', '2026-12-11T05:05', '2026-12-11'])
  })
})
