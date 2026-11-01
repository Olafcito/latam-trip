import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InOut } from '../data/types'
import type { Hop, Journey, Totals } from './journey'
import { importBrowser, importWebTrips, IMPORTED_KEY, type ImportDeps } from './importBrowser'
import type { TripRow } from './repoTrips'
import type { SaveResult } from './remoteTrips'

const flight = { kind: 'flight', from: 'CPH', to: 'GUA', depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10' }
const way = (from: string, to: string) => ({ from, to, depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10', price_dkk: 3900, tickets: [], timeline: [flight] })
const inout = {
  generated_at: '', currency: 'DKK', home: ['CPH'], tickets: {}, options: [],
  airports: { GUA: { map_node: 'GUA' }, SAL: { map_node: 'SAL' }, BOG: { map_node: 'BOG' } },
  ways: { W1: { id: 'W1', ...way('CPH', 'GUA') }, W2: { id: 'W2', ...way('SAL', 'CPH') }, W3: { id: 'W3', ...way('CPH', 'BOG') } },
} as unknown as InOut
const zero = {
  tickets_dkk: 1, regional_flights_dkk: 2, cabin_bag_dkk: null, checked_bag_dkk: null, hub_nights: 0, hub_stay_dkk: 0,
  ground_dkk: 3, ground_unknown: 0, flights: 4, air_hours: 5, days_per_country: { GT: 7 }, hub_stops: [],
} as Totals

const hop: Hop = { from: 'GUA', to: 'SAL', mode: 'bus', operator: null, hours: 5, price_dkk: 100, overnight: false, border: true, flight: null }
const journey = (id: string, over: Partial<Journey> = {}): Journey => ({
  id, name: `Trip ${id}`, wayIn: 'W1', wayHome: 'W2', optionId: null,
  places: [{ node: 'GUA', hop: null }, { node: 'SAL', hop }], ...over,
})

function fakeStorage(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

let docs: Record<string, unknown>
let saved: TripRow[]
let removed: string[]
let stored: TripRow[]
let cutover: boolean

function deps(storage: ReturnType<typeof fakeStorage>, map: Record<string, string> = {}): ImportDeps {
  return {
    storage,
    projectRef: 'projref',
    inout,
    cutoverDone: async () => cutover,
    readDoc: async (name) => (name === 'way_id_map' ? map : (docs[name] ?? null)),
    writeDoc: async (name, data) => void (docs[name] = data),
    latest: async () => stored,
    save: async (row): Promise<SaveResult> => {
      saved.push(row)
      return { status: 'saved', id: row.id, version: row.version, skipped: false }
    },
    remove: async (id) => {
      removed.push(id)
      return { ok: true }
    },
    totals: () => zero,
  }
}

const withJourneys = (list: Journey[], hidden: Record<string, number> = {}) =>
  fakeStorage({ 'latam-planner.journeys': JSON.stringify(list), 'latam-planner.hidden': JSON.stringify(hidden) })

const storedRow = (id: string, version: number): TripRow =>
  ({ id, version, name: 'Stored', saved_at: '2026-11-02T10:00:00Z', by: 'planner', why: '', way_in: way('CPH', 'GUA'), way_home: way('SAL', 'CPH'), tickets: null, places: [{ node: 'GUA', hop: null }, { node: 'SAL', hop }] }) as unknown as TripRow

beforeEach(() => {
  docs = {}
  saved = []
  removed = []
  stored = []
  cutover = true
})

describe('importBrowser', () => {
  it('translates way ids with the map', async () => {
    const rep = await importBrowser(deps(withJourneys([journey('a', { wayIn: 'old1', wayHome: 'old2' })]), { old1: 'W1', old2: 'W2' }))
    expect(rep.imported).toEqual(['a'])
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ id: 'a', by: 'planner', version: 1 })
    expect(saved[0].way_in.to).toBe('GUA')
  })

  it('a wrong first or last node goes to unresolved_journeys', async () => {
    // W3 lands in BOG but the journey starts in GUA
    const bad = journey('bad', { wayIn: 'W3' })
    const lastWrong = journey('lastwrong', { places: [{ node: 'GUA', hop: null }, { node: 'BOG', hop: { ...hop, to: 'BOG' } }] })
    const lost = journey('lost', { wayIn: 'gone' })
    const rep = await importBrowser(deps(withJourneys([bad, lastWrong, lost, journey('ok')])))
    expect(rep.imported).toEqual(['ok'])
    expect(rep.unresolved.sort()).toEqual(['bad', 'lastwrong', 'lost'])
    expect(saved.map((r) => r.id)).toEqual(['ok'])
    const doc = docs.unresolved_journeys as Journey[]
    expect(doc.map((j) => j.id).sort()).toEqual(['bad', 'lastwrong', 'lost'])
    expect(doc.find((j) => j.id === 'bad')).toEqual(bad)
  })

  it('a local edit of an old version imports as a new id', async () => {
    stored = [storedRow('t', 3)]
    const rep = await importBrowser(deps(withJourneys([journey('t', { version: 2 }), journey('u', { version: 3 })])))
    expect(rep.imported.length).toBe(2)
    expect(saved.find((r) => r.id === 't')).toBeUndefined()
    const fresh = saved.find((r) => r.id !== 't' && r.id !== 'u')
    expect(fresh?.id).toBeTruthy()
    expect(fresh?.version).toBe(1)
    // an edit of the latest version keeps its id
    expect(saved.find((r) => r.id === 'u')).toBeDefined()
  })

  it('hidden soft deletes only with no newer version', async () => {
    stored = [storedRow('old', 1), storedRow('newer', 4)]
    await importBrowser(deps(withJourneys([], { old: 1, newer: 2, never: 1 })))
    expect(removed).toEqual(['old'])
  })

  it('the marker holds the project ref', async () => {
    const storage = withJourneys([journey('a')])
    await importBrowser(deps(storage))
    expect(storage.getItem(IMPORTED_KEY)).toBe('projref')
  })

  it('a second run does nothing', async () => {
    const storage = withJourneys([journey('a')])
    await importBrowser(deps(storage))
    saved = []
    const rep = await importBrowser(deps(storage))
    expect(rep.ran).toBe(false)
    expect(saved).toEqual([])
  })

  it('a marker of another project does not block the import', async () => {
    const storage = fakeStorage({ [IMPORTED_KEY]: 'other', 'latam-planner.journeys': JSON.stringify([journey('a')]) })
    const rep = await importBrowser(deps(storage))
    expect(rep.ran).toBe(true)
    expect(storage.getItem(IMPORTED_KEY)).toBe('projref')
  })

  it('no import runs before cutover_done', async () => {
    cutover = false
    const storage = withJourneys([journey('a')])
    const rep = await importBrowser(deps(storage))
    expect(rep).toMatchObject({ ran: false, reason: 'before cutover' })
    expect(saved).toEqual([])
    expect(storage.getItem(IMPORTED_KEY)).toBeNull()
  })

  it('a save that failed leaves the marker unset so the next start tries again', async () => {
    const storage = withJourneys([journey('a')])
    const d = deps(storage)
    d.save = vi.fn(async () => ({ status: 'queued', reason: 'offline' }) as SaveResult)
    const rep = await importBrowser(d)
    expect(rep.failed).toEqual(['a'])
    expect(storage.getItem(IMPORTED_KEY)).toBeNull()
  })
})

describe('importWebTrips', () => {
  const raw = JSON.stringify({ trips: [{ id: 'w1', name: 'Web', legs: [], updated: 1 }], active: null })

  it('web trips import once into web_trips', async () => {
    const storage = fakeStorage({ 'latam-trip.trips': raw })
    const d = deps(storage)
    const first = await importWebTrips(d)
    expect(first.ran).toBe(true)
    expect(docs.web_trips).toEqual(JSON.parse(raw))
    expect(storage.getItem(IMPORTED_KEY + '.web')).toBe('projref')
    docs.web_trips = 'changed'
    const second = await importWebTrips(d)
    expect(second.ran).toBe(false)
    expect(docs.web_trips).toBe('changed')
  })

  it('does not run before cutover_done and does not overwrite stored web_trips', async () => {
    cutover = false
    const storage = fakeStorage({ 'latam-trip.trips': raw })
    expect((await importWebTrips(deps(storage))).ran).toBe(false)
    expect(docs.web_trips).toBeUndefined()
    cutover = true
    docs.web_trips = { trips: [], active: null, mine: true }
    expect((await importWebTrips(deps(storage))).ran).toBe(true)
    expect(docs.web_trips).toEqual({ trips: [], active: null, mine: true })
  })
})
