import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store'
import type { AppData, CrawledFlight, MapEdge } from './data/types'
import { totals, travelTotal, type Hop, type Journey, type Totals } from './lib/journey'

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
