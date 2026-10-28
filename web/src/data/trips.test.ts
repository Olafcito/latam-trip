import { describe, expect, it } from 'vitest'
import { mergeSeeds, parseSeedFile, tripPieces, addLeg, createTrip, deleteTrip, fromOldJourney, legIndex, openTrip, parseTrips, removeLeg, renameTrip, tripEnd, tripStops, EMPTY_TRIPS, type TripLeg } from './trips'

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

describe('seeded trips', () => {
  const file = {
    trips: [
      {
        id: 'seed-1', name: 'Guatemala City in, Bogota home', rank: 1,
        legs: [{ cid: 'LPB-SJO', from: 'SJO', to: 'LPB', mode: 'flight' }, { cid: 'bad' }],
        inout: { option_id: 'GUA-BOG-ticket', type: 'ticket', entry: 'GUA', exit: 'BOG', price_dkk: 7637, way_in: {}, way_home: {} },
        segments: [{ kind: 'overland', from: 'GUA', to: 'SJO' }, { kind: 'flight', from: 'SJO', to: 'LPB', price_dkk: 2187 }],
      },
      { name: 'no id' },
    ],
  }

  it('parses the seed file, keeping in/out and segments and dropping bad legs', () => {
    const seeds = parseSeedFile(file)
    expect(seeds).toHaveLength(1)
    expect(seeds[0].seed).toBe(true)
    expect(seeds[0].legs).toHaveLength(1)
    expect(seeds[0].inout?.entry).toBe('GUA')
    expect(seeds[0].segments).toHaveLength(2)
    expect(parseSeedFile(null)).toEqual([])
  })

  it('adds a seed once, and never again after the user deleted it', () => {
    const seeds = parseSeedFile(file)
    let r = mergeSeeds(EMPTY_TRIPS, seeds, [])
    expect(r.state.trips.map((t) => t.id)).toEqual(['seed-1'])
    expect(r.imported).toEqual(['seed-1'])
    r = mergeSeeds(deleteTrip(r.state, 'seed-1'), seeds, r.imported)
    expect(r.state.trips).toEqual([])
  })

  it('keeps seed fields through a save and reload', () => {
    const s = mergeSeeds(EMPTY_TRIPS, parseSeedFile(file), []).state
    const back = parseTrips(JSON.parse(JSON.stringify(s)))
    expect(back.trips[0].inout?.exit).toBe('BOG')
    expect(back.trips[0].rank).toBe(1)
  })
})

describe('seeded trip pieces', () => {
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

  it('refreshes a stored seed from the file but keeps its name and legs', () => {
    const seeds = parseSeedFile({ trips: [{ id: 'seed-1', name: 'New', rank: 2, legs: [], inout: { entry: 'GUA', exit: 'SAL' } }] })
    const mine = { trips: [{ id: 'seed-1', name: 'Mine', seed: true, rank: 1, legs: [leg('A', 'B')], updated: 5, inout: { entry: 'GUA', exit: 'BOG' } as never }], active: null }
    const r = mergeSeeds(mine, seeds, ['seed-1'])
    expect(r.state.trips[0]).toMatchObject({ name: 'Mine', rank: 2, legs: [leg('A', 'B')], inout: { exit: 'SAL' } })
    expect(mergeSeeds(r.state, seeds, ['seed-1']).state).toBe(r.state)
  })
})
