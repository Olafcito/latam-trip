import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { InOut } from '../data/types'
import type { Journey } from './journey'
import {
  localOnly, mergeTrips, parseTripsFile, resolveDeepLink, retireSeeds, rowToJourney, sameJourney,
  tripParam, urlWithTrip, withTripWays, type TripRow,
} from './repoTrips'

const way = (from: string, to: string) => ({
  from, to, depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10', price_dkk: 3900,
  tickets: ['TQ:abc'], airports: [from, to],
  timeline: [{ kind: 'flight', from, to, depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10' }],
}) as unknown as TripRow['way_in']

const row = (id: string, over: Partial<TripRow> = {}): TripRow => ({
  id, version: 1, name: `Trip ${id}`, saved_at: '2026-10-29T10:00:00Z', by: 'plan-trip', why: 'cheapest way round',
  rank: null, option_id: null,
  way_in: way('CPH', 'GUA'), way_home: way('BOG', 'CPH'),
  tickets: { 'TQ:abc': { id: 'TQ:abc', price_dkk: 7850, observed_at: '2026-10-28T17:18:27Z' } },
  places: [
    { node: 'GUA', hop: null, why: 'the way in lands here' },
    { node: 'BOG', hop: { from: 'GUA', to: 'BOG', mode: 'flight', operator: null, hours: 3, price_dkk: 1200, overnight: false, border: true, flight: null, observed_at: '2026-10-28T16:55:00Z' } },
  ],
  ...over,
})

const inout = { generated_at: '', currency: 'DKK', home: ['CPH'], airports: {}, tickets: {}, ways: {}, options: [] } as unknown as InOut

const local = (id: string, over: Partial<Journey> = {}): Journey => ({
  id, name: `Mine ${id}`, wayIn: 'w1', wayHome: 'w2', optionId: null, places: [{ node: 'GUA', hop: null }], savedAt: '2026-10-20T08:00:00Z', ...over,
})

describe('parseTripsFile', () => {
  it('keeps the trips and leaves out anything that is not a trip', () => {
    const rows = parseTripsFile({ trips: [row('a'), { id: 'broken' }, null, row('b')] })
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('gives no trips for a file without a list', () => {
    expect(parseTripsFile(null)).toEqual([])
    expect(parseTripsFile({ trips: 'no' })).toEqual([])
  })
})

describe('withTripWays and rowToJourney', () => {
  it('registers the ways under the trip id and adds the trip tickets', () => {
    const io = withTripWays(inout, [row('a')])
    expect(io.ways['a:in'].from).toBe('CPH')
    expect(io.ways['a:in'].direction).toBe('in')
    expect(io.ways['a:home'].to).toBe('CPH')
    expect(io.tickets['TQ:abc'].price_dkk).toBe(7850)
    expect(io.tickets['TQ:abc'].observed_at).toBe('2026-10-28T17:18:27Z')
  })

  it('keeps a ticket the build already has', () => {
    const have = { ...inout, tickets: { 'TQ:abc': { id: 'TQ:abc', price_dkk: 6494 } } } as unknown as InOut
    expect(withTripWays(have, [row('a')]).tickets['TQ:abc'].price_dkk).toBe(6494)
  })

  it('turns a row into a journey with its ways, version and the why of each stop', () => {
    const j = rowToJourney(row('a', { rank: 2, version: 3 }))
    expect(j).toMatchObject({ id: 'a', wayIn: 'a:in', wayHome: 'a:home', optionId: null, rank: 2, version: 3, why: 'cheapest way round' })
    expect(j.places[0]).toEqual({ node: 'GUA', hop: null, why: 'the way in lands here' })
    expect(j.places[1].hop?.observed_at).toBe('2026-10-28T16:55:00Z')
  })
})

describe('the trips list: trips.json next to local trips', () => {
  const repo = [rowToJourney(row('a')), rowToJourney(row('b', { version: 2 }))]

  it('lists local trips first, then the table trips', () => {
    expect(mergeTrips([local('x')], repo).map((j) => j.id)).toEqual(['x', 'a', 'b'])
  })

  it('shows the local copy of an edited table trip instead of the table version', () => {
    const edited = { ...repo[0], name: 'My take on a' }
    const list = mergeTrips([edited], repo)
    expect(list.map((j) => j.id)).toEqual(['a', 'b'])
    expect(list[0].name).toBe('My take on a')
  })

  it('hides a deleted table trip until a newer version comes', () => {
    expect(mergeTrips([], repo, { a: 1, b: 1 }).map((j) => j.id)).toEqual(['b'])
  })

  it('keeps only what the browser changed', () => {
    const edited = { ...repo[0], name: 'My take on a' }
    const kept = localOnly([local('x'), edited, repo[1]], repo)
    expect(kept.map((j) => j.id)).toEqual(['x', 'a'])
  })

  it('treats the same content saved at another time as unchanged', () => {
    expect(sameJourney(repo[0], { ...repo[0], savedAt: '2027-01-01T00:00:00Z' })).toBe(true)
  })
})

describe('retireSeeds', () => {
  const repo = [rowToJourney(row('seed-1-gua-bog')), rowToJourney(row('seed-2-mga-ctg'))]

  it('drops an untouched seeded copy and keeps an edited one', () => {
    const untouched = { ...repo[0], wayIn: 'old-way-id', savedAt: '2026-10-28T00:00:00Z' }
    const edited = { ...repo[1], places: [repo[1].places[0]] }
    const r = retireSeeds([untouched, edited, local('x')], repo, ['seed-1-gua-bog', 'seed-2-mga-ctg'])
    expect(r.local.map((j) => j.id)).toEqual(['seed-2-mga-ctg', 'x'])
    expect(r.hidden).toEqual({})
  })

  it('keeps a seeded trip the user deleted hidden', () => {
    const r = retireSeeds([], repo, ['seed-1-gua-bog'])
    expect(r.hidden).toEqual({ 'seed-1-gua-bog': 1 })
  })
})

describe('deep link /?trip=<id>', () => {
  const trips = [rowToJourney(row('a')), local('x')]

  it('reads the trip parameter', () => {
    expect(tripParam('?trip=a')).toBe('a')
    expect(tripParam('?trip=%20a%20&tab=map')).toBe('a')
    expect(tripParam('?trip=')).toBeNull()
    expect(tripParam('')).toBeNull()
  })

  it('opens a known trip', () => {
    expect(resolveDeepLink('?trip=a', trips)).toEqual({ kind: 'open', journey: trips[0] })
    expect(resolveDeepLink('?trip=x', trips)).toEqual({ kind: 'open', journey: trips[1] })
  })

  it('prefers the open journey when it is the linked trip', () => {
    const current = { ...trips[0], name: 'Being edited' }
    expect(resolveDeepLink('?trip=a', trips, current)).toEqual({ kind: 'open', journey: current })
  })

  it('reports an unknown id', () => {
    expect(resolveDeepLink('?trip=nope', trips)).toEqual({ kind: 'unknown', id: 'nope' })
  })

  it('does nothing without the parameter', () => {
    expect(resolveDeepLink('', trips)).toBeNull()
    expect(resolveDeepLink('?tab=map', trips)).toBeNull()
  })

  it('sets and removes the parameter and keeps the rest of the address', () => {
    expect(urlWithTrip('http://localhost:5181/?tab=map#top', 'a')).toBe('/?tab=map&trip=a#top')
    expect(urlWithTrip('http://localhost:5181/?trip=a&tab=map', null)).toBe('/?tab=map')
    expect(urlWithTrip('http://localhost:5181/?trip=a', null)).toBe('/')
  })
})

describe('the real trips.json', () => {
  const file = resolve(__dirname, '../../../data/web/trips.json')
  it.runIf(existsSync(file))('parses every trip and links each one', () => {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const rows = parseTripsFile(raw)
    expect(rows.length).toBe(raw.trips.length)
    const io = withTripWays(inout, rows)
    for (const r of rows) {
      const j = rowToJourney(r)
      expect(io.ways[j.wayIn]).toBeTruthy()
      expect(io.ways[j.wayHome]).toBeTruthy()
      expect(resolveDeepLink(`?trip=${r.id}`, rows.map(rowToJourney))).toMatchObject({ kind: 'open' })
    }
  })
})
