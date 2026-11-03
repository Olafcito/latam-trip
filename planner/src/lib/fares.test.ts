import { describe, expect, it } from 'vitest'
import type { Way } from '../data/types'
import { fareMarks, fareRows, quoteFlight, sameFlight, seller, sortFares, stopsOf, timed } from './fares'
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

describe('the marks of a flight row', () => {
  const marks = (f = flight(), next: string | null = null) => fareMarks(f, name, next)
  const labels = (f = flight(), next: string | null = null) => {
    const m = marks(f, next)
    return [...m.stops, m.leaves, m.lands, ...m.badges].flatMap((x) => (x ? [x.label] : []))
  }

  it('shows nothing on an ordinary flight with no bags known', () => {
    expect(marks()).toEqual({ stops: [], leaves: null, lands: null, badges: [] })
  })

  it('marks a long wait or a night on the stop where it falls', () => {
    expect(marks(flight({ v: ['PTY', 'LIM'], w: [1.5, 5.83] })).stops).toEqual([null, { kind: 'wait', label: 'Long wait in Lima, 5h 50m', tone: 'part' }])
    expect(marks(flight({ v: ['LIM'], w: [9], o: true })).stops).toEqual([{ kind: 'night', label: 'A night in Lima, 9h' }])
    expect(marks(flight({ v: ['LIM'], w: [3.9] })).stops).toEqual([null])
  })

  it('marks every long wait, and the night only on the stop that holds it', () => {
    expect(marks(flight({ v: ['PTY', 'LIM'], w: [5, 9], o: true })).stops).toEqual([
      { kind: 'wait', label: 'Long wait in Panama City, 5h', tone: 'part' },
      { kind: 'night', label: 'A night in Lima, 9h' },
    ])
    expect(marks(flight({ v: ['PTY', 'LIM'], w: [4.5, 6] })).stops.map((m) => m?.kind ?? null)).toEqual(['wait', 'wait'])
  })

  it('marks a planned stopover and its nights instead of the wait', () => {
    expect(labels(flight({ v: ['PTY'], w: [26.95], o: true, f: ['stopover'] }))).toEqual(['Stopover in Panama City, 1 night'])
    expect(labels(flight({ v: ['PTY'], w: [50], o: true, f: ['stopover'] }))).toEqual(['Stopover in Panama City, 2 nights'])
    expect(marks(flight({ v: ['LIM', 'PTY'], w: [1.5, 26.95], f: ['stopover'] })).stops.map((m) => m?.kind ?? null)).toEqual([null, 'stopover'])
    expect(labels(flight({ v: ['PTY'], f: ['stopover'] }))).toEqual(['Stopover in Panama City'])
  })

  it('puts a long wait on the row when the stop is not known', () => {
    expect(marks(flight({ s: 1, w: [6] })).badges).toEqual([{ kind: 'wait', label: 'Long wait, 6h', tone: 'part' }])
  })

  it('puts the moon on a time in the night', () => {
    expect([marks(flight({ d: '01:10', a: '07:05' })).leaves, marks(flight({ d: '01:10', a: '07:05' })).lands])
      .toEqual([{ kind: 'moon', label: 'Leaves at night, 01:10' }, null])
    expect(marks(flight({ d: '18:00', a: '23:30' })).lands).toEqual({ kind: 'moon', label: 'Lands at night, 23:30' })
    expect(labels(flight({ d: '05:30', a: '15:55' }))).toEqual([])
  })

  it('marks a self transfer and an airport change on the row', () => {
    expect(marks(flight({ f: ['airport_change', 'self_transfer'] })).badges.map((m) => [m.kind, m.label]))
      .toEqual([['self', 'Self transfer, you check in again'], ['airport', 'Changes airport on the way']])
    expect(marks(flight({ f: ['airport_change', 'self_transfer'] })).badges.map((m) => m.text)).toEqual(['Self transfer', 'Airport'])
  })

  it('marks the bags as the site words them', () => {
    const bags = (cabin_bag: string | null, checked_bag: string | null) => fareMarks({ ...flight(), cabin_bag, checked_bag }, name, null).badges
    expect(bags(null, null)).toEqual([])
    expect(bags('included', null)).toEqual([{ kind: 'cabin', label: 'Cabin bag, included', tone: 'ok' }])
    expect(bags('8 kg', '1 x 23 kg').map((m) => m.tone)).toEqual(['ok', 'ok'])
    expect(bags('8 kg', '1 x 23 kg').map((m) => m.text)).toEqual(['8 kg', '23 kg'])
    expect(bags('Not included', 'For a fee').map((m) => m.tone)).toEqual(['no', 'part'])
    expect(bags('ask the airline', null)[0].tone).toBeUndefined()
  })

  it('marks a flight that lands after the next leg leaves, red, on its landing', () => {
    const f = flight({ d: '22:10', a: '05:05', n: 1 })
    expect(fareMarks(f, name, '2026-12-28').lands).toEqual({ kind: 'late', label: 'Lands after the next leg leaves', tone: 'bad' })
    expect(fareMarks(f, name, '2026-12-29').lands?.kind).toBe('moon')
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
