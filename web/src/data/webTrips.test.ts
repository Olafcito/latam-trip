import { beforeEach, describe, expect, it } from 'vitest'
import type { TripState } from './trips'
import { pushWebTrips, syncWebTrips, WEB_IMPORTED_KEY, type WebTripDeps } from './webTrips'

const local: TripState = { trips: [{ id: 'w1', name: 'Web', legs: [], updated: 1 }], active: null }

function fakeStorage(start: Record<string, string> = {}) {
  const m = new Map(Object.entries(start))
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

let docs: Record<string, unknown>
let cutover: boolean
let landed: boolean

function deps(storage = fakeStorage()): WebTripDeps {
  return {
    storage,
    projectRef: 'projref',
    cutoverDone: async () => cutover,
    readDoc: async (name) => docs[name] ?? null,
    // a write that does not land leaves no row, as a refused request would
    writeDoc: async (name, data) => void (landed && (docs[name] = data)),
  }
}

beforeEach(() => {
  docs = {}
  cutover = true
  landed = true
})

describe('the web app trips and web_trips', () => {
  it('moves the trips of this browser into the row once and sets the marker after the row is there', async () => {
    const storage = fakeStorage()
    const r = await syncWebTrips(deps(storage), local)
    expect(r).toMatchObject({ ran: true, imported: true, live: true })
    expect(docs.web_trips).toEqual(local)
    expect(storage.getItem(WEB_IMPORTED_KEY)).toBe('projref')
    docs.web_trips = { trips: [], active: null }
    expect(await syncWebTrips(deps(storage), local)).toMatchObject({ ran: false, reason: 'already imported' })
    expect(docs.web_trips).toEqual({ trips: [], active: null })
  })

  it('sets no marker when the row did not land, so the next open tries again', async () => {
    landed = false
    const storage = fakeStorage()
    const r = await syncWebTrips(deps(storage), local)
    expect(r).toMatchObject({ imported: false, live: false })
    expect(storage.getItem(WEB_IMPORTED_KEY)).toBeNull()
    landed = true
    expect((await syncWebTrips(deps(storage), local)).imported).toBe(true)
  })

  it('sets no marker when there is nothing to move and no row', async () => {
    const storage = fakeStorage()
    const r = await syncWebTrips(deps(storage), { trips: [], active: null })
    expect(r.live).toBe(false)
    expect(storage.getItem(WEB_IMPORTED_KEY)).toBeNull()
    expect(docs.web_trips).toBeUndefined()
  })

  it('does nothing before cutover_done', async () => {
    cutover = false
    const storage = fakeStorage()
    expect(await syncWebTrips(deps(storage), local)).toMatchObject({ ran: false, reason: 'before cutover', live: false })
    expect(docs.web_trips).toBeUndefined()
    expect(storage.getItem(WEB_IMPORTED_KEY)).toBeNull()
  })

  it('keeps a row that is already stored and hands it back to show', async () => {
    docs.web_trips = { trips: [{ id: 'x', name: 'Stored', legs: [], updated: 5 }], active: null }
    const r = await syncWebTrips(deps(), local)
    expect(r.imported).toBe(false)
    expect(r.stored?.trips.map((t) => t.name)).toEqual(['Stored'])
    expect((docs.web_trips as TripState).trips[0].name).toBe('Stored')
  })

  it('a marker of another project does not block the import', async () => {
    const storage = fakeStorage({ [WEB_IMPORTED_KEY]: 'other' })
    expect((await syncWebTrips(deps(storage), local)).imported).toBe(true)
  })

  it('writes an edit only after the import, last write wins', async () => {
    const storage = fakeStorage()
    expect(await pushWebTrips(deps(storage), local)).toBe(false)
    expect(docs.web_trips).toBeUndefined()
    await syncWebTrips(deps(storage), local)
    const next: TripState = { trips: [{ id: 'w1', name: 'Renamed', legs: [], updated: 2 }], active: null }
    expect(await pushWebTrips(deps(storage), next)).toBe(true)
    expect(docs.web_trips).toEqual(next)
  })
})
