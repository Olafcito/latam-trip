import { describe, expect, it } from 'vitest'
import { tripPieces, addLeg, createTrip, deleteTrip, fromOldJourney, legIndex, openTrip, parseTrips, removeLeg, renameTrip, tripEnd, tripStops, EMPTY_TRIPS, type TripLeg } from './trips'

const leg = (from: string, to: string, mode: TripLeg['mode'] = 'bus'): TripLeg => ({ cid: [from, to].sort().join('-'), from, to, mode })

describe('trip edits', () => {
  it('creates an open trip and adds legs to it only', () => {
    let s = createTrip(EMPTY_TRIPS, '  ', 'a')
    expect(s.active).toBe('a')
    expect(s.trips[0].name).toBe('Trip 1')
    s = addLeg(s, leg('GDL', 'GUA', 'flight'))
    s = addLeg(s, leg('GUA', 'ANT'))
    expect(s.trips[0].legs).toHaveLength(2)
    s = openTrip(s, null)
    expect(addLeg(s, leg('ANT', 'COPAN'))).toBe(s)
  })

  it('renames, removes legs and deletes', () => {
    let s = createTrip(EMPTY_TRIPS, 'Loop', 'a')
    s = addLeg(addLeg(s, leg('GDL', 'GUA', 'flight')), leg('GUA', 'ANT'))
    s = renameTrip(s, 'a', 'Central America')
    expect(s.trips[0].name).toBe('Central America')
    expect(renameTrip(s, 'a', ' ')).toBe(s)
    s = removeLeg(s, 'a', 0)
    expect(s.trips[0].legs.map((l) => l.to)).toEqual(['ANT'])
    s = deleteTrip(s, 'a')
    expect(s).toEqual({ trips: [], active: null })
  })

  it('finds a leg by connection, direction and mode', () => {
    const s = addLeg(createTrip(EMPTY_TRIPS, 'x', 'a'), leg('GUA', 'ANT'))
    expect(legIndex(s.trips[0], 'ANT-GUA', 'GUA', 'bus')).toBe(0)
    expect(legIndex(s.trips[0], 'ANT-GUA', 'ANT', 'bus')).toBe(-1)
    expect(legIndex(s.trips[0], 'ANT-GUA', 'GUA', 'shuttle')).toBe(-1)
  })
})

describe('tripStops', () => {
  it('lists places in order and repeats a start that breaks the chain', () => {
    const trip = { id: 'a', name: 'x', updated: 0, legs: [leg('GDL', 'GUA'), leg('GUA', 'ANT'), leg('SAP', 'RTB')] }
    expect(tripStops(trip)).toEqual(['GDL', 'GUA', 'ANT', 'SAP', 'RTB'])
    expect(tripEnd(trip)).toBe('RTB')
  })
})

describe('stored trips', () => {
  it('drops malformed trips and legs and an unknown open id', () => {
    const s = parseTrips({ trips: [{ id: 'a', name: 'ok', legs: [leg('A', 'B'), { cid: 1 }], updated: 5 }, { id: 2 }], active: 'zz' })
    expect(s.trips).toHaveLength(1)
    expect(s.trips[0].legs).toHaveLength(1)
    expect(s.active).toBeNull()
    expect(parseTrips(null)).toEqual(EMPTY_TRIPS)
  })

  it('turns the old journey keys into a chained trip', () => {
    const t = fromOldJourney(['GDL-GUA|flight', 'ANT-GUA|bus', 'bad'])!
    expect(t.legs.map((l) => [l.from, l.to])).toEqual([['GDL', 'GUA'], ['GUA', 'ANT']])
    expect(fromOldJourney([])).toBeNull()
  })
})

describe('planned trip fields', () => {
  it('keeps rank, in and out and segments through a save and reload', () => {
    const s = {
      trips: [{
        id: 'seed-1', name: 'Guatemala City in, Bogota home', seed: true, rank: 1, updated: 0,
        legs: [{ cid: 'LPB-SJO', from: 'SJO', to: 'LPB', mode: 'flight' }, { cid: 'bad' }],
        inout: { option_id: 'GUA-BOG-ticket', type: 'ticket', entry: 'GUA', exit: 'BOG', price_dkk: 7637, way_in: {}, way_home: {} },
        segments: [{ kind: 'overland', from: 'GUA', to: 'SJO' }, { kind: 'flight', from: 'SJO', to: 'LPB', price_dkk: 2187 }],
      }],
      active: null,
    }
    const back = parseTrips(JSON.parse(JSON.stringify(s)))
    expect(back.trips[0].seed).toBe(true)
    expect(back.trips[0].legs).toHaveLength(1)
    expect(back.trips[0].inout?.exit).toBe('BOG')
    expect(back.trips[0].rank).toBe(1)
    expect(back.trips[0].segments).toHaveLength(2)
  })
})

describe('planned trip pieces', () => {
  const seeded = (legs: TripLeg[]) => ({
    id: 's', name: 'S', updated: 0, legs,
    segments: [
      { kind: 'overland' as const, from: 'GUA', to: 'SJO', note: 'By bus' },
      { kind: 'flight' as const, from: 'SJO', to: 'LPB' },
      { kind: 'flight' as const, from: 'LPB', to: 'CBB' },
      { kind: 'overland' as const, from: 'CBB', to: 'CBB', note: 'Stay' },
    ],
  })

  it('follows the segments, overland blocks included, and stops in travel order', () => {
    const t = seeded([leg('SJO', 'LPB', 'flight'), leg('LPB', 'CBB', 'flight')])
    expect(tripPieces(t).map((p) => `${p.kind}:${p.from}>${p.to}`)).toEqual(['overland:GUA>SJO', 'leg:SJO>LPB', 'leg:LPB>CBB', 'overland:CBB>CBB'])
    expect(tripStops(t)).toEqual(['GUA', 'SJO', 'LPB', 'CBB'])
    expect(tripEnd(t)).toBe('CBB')
  })

  it('drops a removed flight and puts added legs after the segments', () => {
    const t = seeded([leg('SJO', 'LPB', 'flight'), leg('CBB', 'VVI', 'bus')])
    expect(tripPieces(t).map((p) => `${p.from}>${p.to}`)).toEqual(['GUA>SJO', 'SJO>LPB', 'CBB>CBB', 'CBB>VVI'])
  })
})
