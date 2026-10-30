import { beforeEach, describe, expect, it } from 'vitest'
import { useStore } from './store'
import type { AppData, CrawledFlight, MapEdge } from './data/types'
import { totals, type Hop, type Journey } from './lib/journey'

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
    in: { flights: 1, flying_hours: 0, timeline: [], tickets: [] },
    home: { flights: 1, flying_hours: 0, timeline: [], tickets: [] },
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
