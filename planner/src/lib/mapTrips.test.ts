import { describe, expect, it } from 'vitest'
import type { MapData } from '../data/types'
import type { Journey, Place } from './journey'
import { OWN_WAY, journeyToTrip, placesFromLegs, toTripState } from './mapTrips'

const map: MapData = {
  nodes: [],
  edges: [
    { from: 'MEX', to: 'GUA', mode: 'bus', duration_h: 20, price_dkk: 500, both: true },
    { from: 'GUA', to: 'SAL', mode: 'bus', duration_h: 5, price_dkk: 150, both: true },
    { from: 'SAL', to: 'SJO', mode: 'bus', duration_h: 12, price_dkk: 300, both: true },
    { from: 'GUA', to: 'SJO', mode: 'flight', duration_h: 2, price_dkk: 900, both: true },
  ],
}

const place = (node: string, from: string | null, nights = 3): Place => ({
  node,
  nights,
  hop: from ? { from, to: node, mode: 'bus', operator: null, hours: 1, price_dkk: 1, overnight: false, border: false, flight: null } : null,
})

const j: Journey = {
  id: 'j1', name: 'Loop', wayIn: 'I1', wayHome: 'H1', optionId: null,
  places: [place('MEX', null), place('GUA', 'MEX'), place('SAL', 'GUA'), place('SJO', 'SAL')],
}

describe('journeys as map trips', () => {
  it('turns places into legs that start at the way-in city', () => {
    const t = journeyToTrip(j)
    expect(t.start).toBe('MEX')
    expect(t.legs.map((l) => `${l.from}>${l.to}`)).toEqual(['MEX>GUA', 'GUA>SAL', 'SAL>SJO'])
    expect(t.legs[0].cid).toBe('GUA-MEX')
  })

  it('lists the current journey with the saved ones and opens it only while the map shows it', () => {
    const other = { ...j, id: 'j2', name: 'Other' }
    expect(toTripState(j, [other], true).trips.map((t) => t.id)).toEqual(['j2', 'j1'])
    expect(toTripState(j, [other], true).active).toBe('j1')
    expect(toTripState(j, [{ ...j, name: 'Old' }], false)).toMatchObject({ active: null, trips: [{ name: 'Loop' }] })
  })

  it('keeps nights when a leg is added and gives the new place 2 nights', () => {
    const legs = [...journeyToTrip(j).legs, { cid: 'SAL-SJO', from: 'SJO', to: 'SAL', mode: 'bus' as const }]
    const places = placesFromLegs(j, legs, map)
    expect(places.map((p) => p.nights)).toEqual([3, 3, 3, 3, 2])
    expect(places[4].hop).toMatchObject({ from: 'SJO', to: 'SAL', hours: 12, price_dkk: 300 })
  })

  it('drops the place a removed leg led to and rejoins its neighbours', () => {
    const legs = journeyToTrip(j).legs.filter((_, i) => i !== 1)
    const places = placesFromLegs(j, legs, map)
    expect(places.map((p) => p.node)).toEqual(['MEX', 'GUA', 'SJO'])
    expect(places[2].hop).toMatchObject({ from: 'GUA', mode: 'flight', hours: 2 })
  })

  it('bridges a leg that starts away from the last place, by own way when there is no route', () => {
    const start: Journey = { ...j, places: [place('MEX', null)] }
    const places = placesFromLegs(start, [{ cid: 'LIM-CUZ', from: 'LIM', to: 'CUZ', mode: 'bus' }], map, () => ({ operator: 'Cruz del Sur', hours: 21, price_dkk: 400, overnight: true, border: false }))
    expect(places.map((p) => p.node)).toEqual(['MEX', 'LIM', 'CUZ'])
    expect(places[1].hop?.operator).toBe(OWN_WAY)
    expect(places[2].hop).toMatchObject({ operator: 'Cruz del Sur', hours: 21, overnight: true })
  })
})
