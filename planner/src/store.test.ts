import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ownKey } from '@map/data/ownKey'
import { CURRENT_KEY, useStore } from './store'
import type { AppData, Booking, CrawledFlight, InOut, MapEdge, Way } from './data/types'
import { schedule, totals, travelTotal, type Hop, type Journey, type Totals } from './lib/journey'
import { rowToJourney, withTripWays, type TripRow } from './lib/repoTrips'
import { chooseWay } from './lib/ways'

const trip: Journey = {
  id: 'jtest',
  name: 'Test',
  wayIn: 'in',
  wayHome: 'home',
  optionId: null,
  places: [{ node: 'GDL', hop: null }, { node: 'GUA', hop: null }, { node: 'SAL', hop: null }],
}

describe('another tab changes the trip', () => {
  it('follows when this tab shows the same trip and stays when it does not', () => {
    useStore.getState().setJourney(trip)
    useStore.getState().followTab(JSON.stringify({ ...trip, name: 'Changed there' }))
    expect(useStore.getState().journey?.name).toBe('Changed there')
    useStore.getState().followTab(JSON.stringify({ ...trip, id: 'other', name: 'Another trip' }))
    expect(useStore.getState().journey?.name).toBe('Changed there')
  })

  it('stays as it is when the stored text is not a trip', () => {
    useStore.getState().setJourney(trip)
    useStore.getState().followTab('not json')
    useStore.getState().followTab('{}')
    useStore.getState().followTab(null)
    expect(useStore.getState().journey?.name).toBe('Test')
  })
})

describe('picking a flight for a leg', () => {
  const edge = { from: 'GDL', to: 'GUA', mode: 'flight', oneway_min_dkk: 700, oneway_min_hours: 4 } as MapEdge
  const flight: CrawledFlight = {
    quote_id: 'q', depart: '2026-12-20T22:10', arrive: '2026-12-21T05:05', hours: 6.9, price_dkk: 1234,
    carriers: ['Avianca'], via: [], layover_h: [], source: 'momondo', observed_at: '2026-10-29T10:00Z',
  }
  const hop: Hop = { from: 'GDL', to: 'GUA', mode: 'flight', operator: null, hours: 4, price_dkk: 700, overnight: false, border: false, flight: null }
  const leg = () => useStore.getState().journey!.places[1].hop!
  const ways = {
    in: { flights: 1, flying_hours: 0, timeline: [], tickets: [], arrive: '2026-12-03T14:30', from: 'CPH' },
    home: { flights: 1, flying_hours: 0, timeline: [], tickets: [], depart: '2027-02-03T09:05', from: 'SAL' },
  }
  const data = { map: { nodes: [], edges: [edge] }, inout: { ways, tickets: {}, airports: {}, options: [] } } as unknown as AppData

  beforeEach(() => {
    useStore.getState().setData(data)
    useStore.getState().setJourney({ ...trip, places: [trip.places[0], { node: 'GUA', hop }, trip.places[2]] })
  })

  it('takes the flight day, the price, the length and a landing the next day', () => {
    useStore.getState().setHopFlight(1, flight)
    expect([leg().date, leg().price_dkk, leg().hours, leg().overnight, leg().flight?.quote_id]).toEqual(['2026-12-20', 1234, 6.9, true, 'q'])
  })

  it('counts in the totals', () => {
    const s = useStore.getState()
    s.setHopFlight(1, flight)
    expect(totals(data, useStore.getState().journey!, null).regional_flights_dkk).toBe(1234)
  })

  it('leaves checked bags out of the travel total', () => {
    const t = { tickets_dkk: 1000, regional_flights_dkk: 200, ground_dkk: 50, hub_stay_dkk: 30, cabin_bag_dkk: 20, checked_bag_dkk: 900 } as Totals
    expect(travelTotal(t)).toBe(1300)
  })

  it('goes back to the typical price on Remove and keeps the day', () => {
    const s = useStore.getState()
    s.setHopFlight(1, flight)
    s.setHopFlight(1, null)
    expect([leg().flight, leg().price_dkk, leg().hours, leg().overnight, leg().date]).toEqual([null, 700, 4, false, '2026-12-20'])
  })

  it('does nothing for a place with no leg', () => {
    const before = useStore.getState().journey
    useStore.getState().setHopFlight(0, flight)
    expect(useStore.getState().journey).toBe(before)
  })

  it('sets the flight aside when the leg moves to another day, and takes the typical price', () => {
    const s = useStore.getState()
    s.setHopFlight(1, flight)
    s.setHopDate(1, '2026-12-19')
    expect([leg().date, leg().flight, leg().parked?.quote_id, leg().price_dkk, leg().hours]).toEqual(['2026-12-19', null, 'q', 700, 4])
  })

  it('gets the flight back when the leg is on its day again', () => {
    const s = useStore.getState()
    s.setHopFlight(1, flight)
    s.setHopDate(1, '2026-12-19')
    s.setHopDate(1, '2026-12-20')
    expect([leg().flight?.quote_id, leg().parked, leg().price_dkk, leg().overnight]).toEqual(['q', undefined, 1234, true])
  })

  it('does the same when a night stepper moves the leg and moves it back', () => {
    const s = useStore.getState()
    s.setHopFlight(1, flight)
    s.moveNights({ legs: [{ hop: 1, date: '2026-12-21' }], lastNights: 5 })
    expect([leg().flight, leg().parked?.quote_id]).toEqual([null, 'q'])
    s.moveNights({ legs: [{ hop: 1, date: '2026-12-20' }], lastNights: 5 })
    expect(leg().flight?.quote_id).toBe('q')
  })

  it('forgets the flight set aside when another one is picked', () => {
    const s = useStore.getState()
    s.setHopFlight(1, flight)
    s.setHopDate(1, '2026-12-19')
    s.setHopFlight(1, { ...flight, quote_id: 'r', depart: '2026-12-19T08:00', arrive: '2026-12-19T12:00' })
    s.setHopDate(1, '2026-12-20')
    expect([leg().flight, leg().parked]).toEqual([null, { ...flight, quote_id: 'r', depart: '2026-12-19T08:00', arrive: '2026-12-19T12:00' }])
  })

  it('puts right a trip stored with a leg off its flight', () => {
    const off = { ...hop, date: '2026-12-27', flight }
    const stored = { ...trip, places: [trip.places[0], { node: 'GUA', hop: off }, trip.places[2]] }
    useStore.getState().openTrip(stored)
    expect([leg().flight, leg().parked?.quote_id, leg().price_dkk]).toEqual([null, 'q', 700])
  })

  it('moves no other leg when one leg gets a day or a flight', () => {
    const three = { ...trip, places: [trip.places[0], { node: 'GUA', hop }, { node: 'SAL', hop: { ...hop, from: 'GUA', to: 'SAL' } }] }
    const s = useStore.getState()
    s.setJourney(three)
    const next = () => useStore.getState().journey!.places[2].hop!.date
    s.setHopDate(1, '2026-12-10')
    const pinned = next()
    expect(pinned).toBeDefined()
    s.setHopDate(1, '2026-12-12')
    expect(next()).toBe(pinned)
    s.setHopFlight(1, flight)
    expect(next()).toBe(pinned)
  })
})

describe('a card opened from Trips', () => {
  const ref = { kind: 'gym', id: 'g1' } as const

  it('keeps where it came from after the map took the card, until the screen changes', () => {
    const s = useStore.getState
    s().openMapCard(ref)
    s().clearMapCard()
    expect([s().mapCard, s().mapCardFrom, s().screen]).toEqual([null, ref, 'map'])
    s().go('trips')
    expect([s().mapCardFrom, s().screen]).toEqual([null, 'trips'])
  })
})

describe('toggleCursor', () => {
  beforeEach(() => {
    useStore.getState().setJourney(trip)
    useStore.getState().setCursor(null)
  })

  it('builds from a stop on the first tap and goes back to the itinerary on the second', () => {
    const s = useStore.getState
    s().toggleCursor(1)
    expect([s().cursor, s().idle]).toEqual([1, false])
    s().toggleCursor(1)
    expect(s().idle).toBe(true)
    s().toggleCursor(1)
    expect([s().cursor, s().idle]).toEqual([1, false])
  })

  it('treats the last stop, the default cursor, the same way', () => {
    const s = useStore.getState
    s().toggleCursor(2)
    expect([s().cursor, s().idle]).toEqual([null, true])
    s().toggleCursor(0)
    expect([s().cursor, s().idle]).toEqual([0, false])
  })

  it('cursorTo from the map moves the cursor and never stops building, any other cursor move starts building again', () => {
    const s = useStore.getState
    s().cursorTo('GUA')
    s().cursorTo('GUA')
    expect([s().cursor, s().idle]).toEqual([1, false])
    s().toggleCursor(1)
    expect([s().cursor, s().idle]).toEqual([1, true])
    s().setCursor(0)
    expect([s().cursor, s().idle]).toEqual([0, false])
  })
})

describe('changing the ways and the ends of a trip', () => {
  const way = (over: Partial<Way>): Way => ({
    id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'CTG', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
    total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'CTG'],
    tickets: [], price_dkk: 1000,
    extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
    score: 5, timeline: [], ...over,
  })
  const oneIn = way({ id: 'I_one_1202', depart: '2026-12-02T09:00', arrive: '2026-12-02T18:00' })
  const lateIn = way({ id: 'I_one_1208', depart: '2026-12-08T09:00', arrive: '2026-12-08T18:00' })
  const bogIn = way({ id: 'I_one_BOG', to: 'BOG', depart: '2026-12-03T08:00', arrive: '2026-12-03T16:00' })
  const oneHome = way({ id: 'H_one_0205', direction: 'home', from: 'GUA', to: 'CPH', depart: '2027-02-05T12:00', arrive: '2027-02-06T10:00' })
  const leg = (from: string, to: string, date?: string): Hop => ({ from, to, mode: 'bus', operator: null, hours: 4, price_dkk: 100, overnight: false, border: false, flight: null, ...(date ? { date } : {}) })
  const rowWay = ({ id: _, ...rest }: Way) => rest as unknown as TripRow['way_in']
  // a saved trip still on its own pair of ticket ways
  const row: TripRow = {
    id: 't1', version: 1, name: 'Saved', saved_at: '2026-10-29T10:00:00Z', by: 'planner', why: '',
    way_in: rowWay(way({ type: 'ticket', depart: '2026-12-03T07:00', arrive: '2026-12-03T15:00' })),
    way_home: rowWay(way({ direction: 'home', type: 'ticket', from: 'GUA', to: 'CPH', depart: '2027-02-05T09:00', arrive: '2027-02-06T08:00' })),
    places: [
      { node: 'CTG', hop: null },
      { node: 'SMR', hop: leg('CTG', 'SMR', '2026-12-06') },
      { node: 'GUA', hop: leg('SMR', 'GUA') },
    ],
  }
  const built = { generated_at: '', currency: 'DKK', home: ['CPH'], airports: {}, tickets: {}, options: [], ways: Object.fromEntries([oneIn, lateIn, bogIn, oneHome].map((w) => [w.id, w])) } as unknown as InOut
  const inout = withTripWays(built, [row])
  const data = { map: { nodes: [], edges: [] }, inout } as unknown as AppData
  const s = useStore.getState
  const open = () => s().journey!
  const own = () => ({ wayIn: inout.ways['t1:in'], wayHome: inout.ways['t1:home'] })

  beforeEach(() => {
    s().setData(data)
    s().openTrip(rowToJourney(row))
  })

  it('a way picked for a trip on its own pair sets both ways and keeps the stops', () => {
    s().setWays(chooseWay(inout, oneIn, own()))
    expect([open().wayIn, open().wayHome]).toEqual(['I_one_1202', 'H_one_0205'])
    expect(open().places.map((p) => p.node)).toEqual(['CTG', 'SMR', 'GUA'])
  })

  it('keeps the new ways as the draft of the open trip', () => {
    const kept = new Map<string, string>()
    const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) } })
    try {
      s().setWays(chooseWay(inout, oneIn, own()))
      expect(JSON.parse(kept.get(ownKey(CURRENT_KEY))!).wayIn).toBe('I_one_1202')
    } finally {
      if (was) Object.defineProperty(globalThis, 'localStorage', was)
      else delete (globalThis as { localStorage?: unknown }).localStorage
    }
  })

  it('changing the ends opens the picker for the trip and comes back to it', () => {
    s().changeEndsOf('t1')
    expect([s().screen, s().view, s().pickFor]).toEqual(['trips', 'pick', 't1'])
    s().changeEnds(bogIn, oneHome)
    expect([s().screen, s().view, s().pickFor]).toEqual(['trips', 'trip', null])
    expect(open().places.map((p) => p.node)).toEqual(['BOG', 'CTG', 'SMR', 'GUA'])
    expect([open().id, open().wayIn]).toEqual(['t1', 'I_one_BOG'])
  })

  it('leaving the picker forgets the trip, so the next pick is a new trip', () => {
    s().changeEndsOf('t1')
    s().go('trips', 'home')
    expect(s().pickFor).toBeNull()
  })

  it('a pick in change mode changes the trip, a pick without it starts a new trip', () => {
    const real = s().changeEnds
    const changeEnds = vi.fn(real)
    useStore.setState({ changeEnds })
    try {
      const count = s().saved.length
      s().changeEndsOf('t1')
      s().pickWays(bogIn, oneHome, null)
      expect(changeEnds).toHaveBeenCalledWith(bogIn, oneHome)
      expect([open().id, open().wayIn, s().saved.length, s().view]).toEqual(['t1', 'I_one_BOG', count, 'trip'])
      s().go('trips', 'pick')
      s().pickWays(oneIn, oneHome, null)
      expect(changeEnds).toHaveBeenCalledTimes(1)
      expect([open().id === 't1', s().screen, s().saved.length]).toEqual([false, 'map', count])
    } finally {
      useStore.setState({ changeEnds: real })
    }
  })

  it('changing the ends of a trip that is no longer the open one opens it, as the list does', () => {
    const saved = s().saved
    useStore.setState({ saved: [...saved, { ...rowToJourney(row), id: 't2', name: 'Other' }] })
    try {
      s().changeEndsOf('t2')
      useStore.setState({ viewing: { id: 't1', version: 1, latest: 2, row }, notice: 'An old notice' })
      s().changeEnds(bogIn, oneHome)
      expect([open().id, s().viewing, s().notice, s().pickFor, s().screen, s().view]).toEqual(['t2', null, null, null, 'trips', 'trip'])
      expect(open().places.map((p) => p.node)).toEqual(['BOG', 'CTG', 'SMR', 'GUA'])
    } finally {
      useStore.setState({ saved })
    }
  })

  it('an older version on screen keeps its ends', () => {
    useStore.setState({ viewing: { id: 't1', version: 1, latest: 2, row } })
    try {
      const view = s().view
      s().changeEndsOf('t1')
      expect([s().pickFor, s().view]).toEqual([null, view])
    } finally {
      useStore.setState({ viewing: null })
    }
  })

  it('change mode stays while you look at the map and come back', () => {
    s().changeEndsOf('t1')
    s().go('map')
    s().go('trips')
    expect([s().view, s().pickFor]).toEqual(['pick', 't1'])
    s().showOnMap()
    s().openMapCard({ kind: 'gym', id: 'g1' })
    s().go('trips')
    expect([s().view, s().pickFor]).toEqual(['pick', 't1'])
  })

  it('a new trip picked after change mode is a new trip', () => {
    s().changeEndsOf('t1')
    s().go('map')
    s().go('trips', 'pick')
    expect([s().view, s().pickFor]).toEqual(['pick', null])
  })

  it('a pinned leg before the new arrival shows a clash, nothing is blocked', () => {
    s().changeEnds(lateIn, oneHome)
    const j = open()
    expect(j.wayIn).toBe('I_one_1208')
    const sched = schedule(j, inout.ways[j.wayIn], inout.ways[j.wayHome], 'GUA', (n) => n)
    const clash = sched.warnings.find((w) => w.leg === 1)
    expect(clash?.text).toBe('The leg on from CTG leaves 6 Dec, before you get there 8 Dec 18:00')
  })
})

describe('a booked leg holds its day', () => {
  // Made up rows only. A real reference, price or name never goes in this file.
  const booking = (id: string, from: string, to: string, depart: string, over: Partial<Booking> = {}): Booking => ({
    id, kind: 'flight', status: 'booked', from_code: from, to_code: to, depart, arrive: null,
    place_id: null, check_in: null, check_out: null, lodging_id: null, room_id: null, reference: 'TEST01', seller: null,
    url: null, price_dkk: 500, price: null, currency: null, refundable: null, changeable: null, change_until: null,
    cancel_until: null, cabin_bag: null, checked_bag: null, segments: null, travellers: 1, trip_id: null, ticket: null,
    source: 'manual', notes: null, attachments: [], created_at: '2026-11-03T10:00:00Z', updated_at: '2026-11-03T10:00:00Z',
    ...over,
  })
  const way = (over: Partial<Way>): Way => ({
    id: 'W_in', direction: 'in', type: 'oneways', from: 'CPH', to: 'A', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
    total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'A'],
    tickets: [], price_dkk: 1000, extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
    score: 5, timeline: [], ...over,
  })
  const wIn = way({})
  const wHome = way({ id: 'W_home', direction: 'home', from: 'G', to: 'CPH', depart: '2027-02-03T09:05', arrive: '2027-02-04T09:10' })
  const laterIn = way({ id: 'W_in2', depart: '2026-12-04T06:00', arrive: '2026-12-04T14:30' })
  const laterHome = way({ ...wHome, id: 'W_home2', depart: '2027-02-04T09:05', arrive: '2027-02-05T09:10' })
  const inout = { generated_at: '', currency: 'DKK', home: ['CPH'], airports: {}, tickets: {}, options: [], ways: Object.fromEntries([wIn, wHome, laterIn, laterHome].map((w) => [w.id, w])) } as unknown as InOut
  const data = { map: { nodes: [], edges: [] }, inout } as unknown as AppData
  const nodes = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
  const days = ['2026-12-10', '2026-12-15', '2026-12-20', '2026-12-25', '2026-12-30', '2027-01-05']
  const bus = (from: string, to: string, date: string): Hop => ({ from, to, mode: 'bus', operator: null, hours: 4, price_dkk: 100, overnight: false, border: false, flight: null, date })
  const long: Journey = {
    id: 'jbooked', name: 'Booked', wayIn: 'W_in', wayHome: 'W_home', optionId: null, lastNights: 20,
    places: nodes.map((node, k) => ({ node, hop: k ? bus(nodes[k - 1], node, days[k - 1]) : null })),
  }
  const flight: CrawledFlight = {
    quote_id: 'q', depart: '2026-12-27T08:00', arrive: '2026-12-27T10:00', hours: 2, price_dkk: 900,
    carriers: [], via: [], layover_h: [], source: 'momondo', observed_at: '2026-10-29T10:00Z',
  }
  const s = useStore.getState
  const legDays = () => s().journey!.places.slice(1).map((p) => p.hop!.date)
  const onLeg4 = booking('b4', 'D', 'E', '2026-12-25T08:00')

  beforeEach(() => {
    useStore.setState({ bookings: [onLeg4], unlocked: null })
    s().setData(data)
    s().setJourney(long)
  })
  afterEach(() => useStore.setState({ bookings: [], unlocked: null }))

  it('removing stop 2 moves leg 3, and leg 4 and later keep their days', () => {
    s().removeStop(2)
    expect(s().journey!.places.map((p) => p.node)).toEqual(['A', 'B', 'D', 'E', 'F', 'G'])
    expect(legDays()).toEqual(['2026-12-10', '2026-12-15', '2026-12-25', '2026-12-30', '2027-01-05'])
  })

  it('a day or a flight on a booked leg changes nothing until that leg is unlocked', () => {
    const before = s().journey
    s().setHopDate(4, '2026-12-27')
    s().setHopDate(4, null)
    s().setHopFlight(4, flight)
    expect(s().journey).toBe(before)
    s().setUnlocked(4)
    s().setHopDate(4, '2026-12-27')
    expect(legDays()[3]).toBe('2026-12-27')
    expect(s().unlocked).toBeNull()
  })

  it('a flight on a booked leg goes on once the leg is unlocked', () => {
    s().setUnlocked(4)
    s().setHopFlight(4, flight)
    expect(s().journey!.places[4].hop!.flight?.quote_id).toBe('q')
    expect(s().unlocked).toBeNull()
  })

  it('a cancelled booking locks nothing', () => {
    useStore.setState({ bookings: [{ ...onLeg4, status: 'cancelled' }] })
    s().setHopDate(4, '2026-12-27')
    expect(legDays()[3]).toBe('2026-12-27')
  })

  it('with legs 2 and 5 booked, a day set on leg 4 still moves it', () => {
    useStore.setState({ bookings: [booking('b2', 'B', 'C', '2026-12-15T08:00'), booking('b5', 'E', 'F', '2026-12-30T08:00')] })
    s().setHopDate(4, '2026-12-27')
    expect(legDays()).toEqual(['2026-12-10', '2026-12-15', '2026-12-20', '2026-12-27', '2026-12-30', '2027-01-05'])
  })

  describe('a booked way', () => {
    const onIn = booking('bin', 'CPH', 'A', '2026-12-03T06:00')

    beforeEach(() => useStore.setState({ bookings: [onIn] }))

    it('a pick that would change only the booked way does nothing', () => {
      const before = s().journey
      s().setWays({ wayIn: laterIn, wayHome: wHome, note: null })
      expect(s().journey).toBe(before)
    })

    it('a pick of both ways keeps the booked one and takes the other', () => {
      s().setWays({ wayIn: laterIn, wayHome: laterHome, note: null })
      expect([s().journey!.wayIn, s().journey!.wayHome]).toEqual(['W_in', 'W_home2'])
    })

    it('an unlocked booked way can change, and the lock comes back', () => {
      s().setUnlocked('in')
      s().setWays({ wayIn: laterIn, wayHome: wHome, note: null })
      expect([s().journey!.wayIn, s().unlocked]).toEqual(['W_in2', null])
    })

    it('a new start and end keep the booked way', () => {
      s().changeEnds(laterIn, laterHome)
      expect([s().journey!.wayIn, s().journey!.wayHome]).toEqual(['W_in', 'W_home2'])
      s().setUnlocked('in')
      s().changeEnds(laterIn, laterHome)
      expect([s().journey!.wayIn, s().unlocked]).toEqual(['W_in2', null])
    })
  })
})

describe('the home airport', () => {
  const FILTERS = 'latam-planner.filters'
  let kept: Map<string, string>
  let was: PropertyDescriptor | undefined
  beforeEach(() => {
    kept = new Map()
    was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) } })
    vi.resetModules()
    vi.doMock('./lib/homes', () => ({ HOMES: [{ code: 'CPH', city: 'Copenhagen', country: 'DK' }, { code: 'BLL', city: 'Billund', country: 'DK' }] }))
  })
  const restore = () => {
    vi.doUnmock('./lib/homes')
    vi.resetModules()
    if (was) Object.defineProperty(globalThis, 'localStorage', was)
    else delete (globalThis as { localStorage?: unknown }).localStorage
  }
  const fresh = async () => (await import('./store')).useStore

  it('is Copenhagen at first', async () => {
    try {
      expect((await fresh()).getState().home).toBe('CPH')
    } finally {
      restore()
    }
  })

  it('is kept under the filters key, and a reload of it keeps the home and the filters', async () => {
    try {
      const first = await fresh()
      first.getState().setFilters({ noUS: true })
      first.getState().setHome('BLL')
      expect(JSON.parse(kept.get(ownKey(FILTERS))!)).toMatchObject({ home: 'BLL', noUS: true })
      first.getState().resetFilters()
      expect(JSON.parse(kept.get(ownKey(FILTERS))!)).toMatchObject({ home: 'BLL', noUS: false })
      vi.resetModules()
      const again = (await fresh()).getState()
      expect(again.home).toBe('BLL')
      expect(again.filters).not.toHaveProperty('home')
    } finally {
      restore()
    }
  })

  it('a stored home the list does not have is Copenhagen', async () => {
    try {
      kept.set(ownKey(FILTERS), JSON.stringify({ home: 'XXX', noUS: true }))
      const s = (await fresh()).getState()
      expect([s.home, s.filters.noUS]).toEqual(['CPH', true])
    } finally {
      restore()
    }
  })
})
