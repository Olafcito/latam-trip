import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from './data/types'
import type { Hop, Journey } from './lib/journey'
import type { TripRow } from './lib/repoTrips'
import { resolveDeepLink, sameJourney } from './lib/repoTrips'
import { toTripState } from './lib/mapTrips'

const saveTrip = vi.fn()
const deleteTrip = vi.fn()
vi.mock('./lib/supabase', () => ({ remoteEnabled: () => true, supabase: null }))
vi.mock('./lib/remoteTrips', () => ({
  saveTrip: (...a: unknown[]) => saveTrip(...a),
  deleteTrip: (...a: unknown[]) => deleteTrip(...a),
  sendQueued: async (row: TripRow) => {
    const r = (await saveTrip(row)) as { status: string; reason?: 'offline' | 'session' }
    return r.status === 'saved' ? { status: 'saved' } : r.status === 'queued' ? { status: 'queued', reason: r.reason } : { status: 'deleted' }
  },
}))

import { ownKey } from '@map/data/ownKey'
import { outbox } from './lib/outbox'
import { useStore } from './store'

function fakeStorage() {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }
}

const flight = { kind: 'flight', from: 'CPH', to: 'GUA', depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10' }
const way = (from: string, to: string) => ({
  from, to, depart: '2026-12-02T09:55', arrive: '2026-12-03T14:30', price_dkk: 3900, tickets: [], timeline: [flight],
  flights: 1, flying_hours: 0,
})
const data = { map: { nodes: [], edges: [] }, inout: { ways: { in: way('CPH', 'GUA'), home: way('SAL', 'CPH') }, tickets: {}, airports: {}, options: [] } } as unknown as AppData

const hop: Hop = { from: 'GUA', to: 'SAL', mode: 'bus', operator: null, hours: 5, price_dkk: 100, overnight: false, border: true, flight: null }
const trip: Journey = {
  id: 'trip-a', name: 'Mine', wayIn: 'in', wayHome: 'home', optionId: null,
  places: [{ node: 'GUA', hop: null }, { node: 'SAL', hop }],
}

const stored = (v: number, name = 'Mine'): TripRow => ({
  id: 'trip-a', version: v, name, saved_at: '2026-11-01T10:00:00Z', by: 'planner', why: '',
  way_in: way('CPH', 'GUA'), way_home: way('SAL', 'CPH'), tickets: null,
  places: [{ node: 'GUA', hop: null }, { node: 'SAL', hop }],
}) as unknown as TripRow

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
  saveTrip.mockReset()
  deleteTrip.mockReset()
  useStore.setState({ rows: {}, saved: [], repo: [], notice: null, journey: null })
  useStore.getState().setData(data)
  useStore.getState().setJourney(trip)
})

describe('saving through Supabase', () => {
  it('stores the trip and shows it as saved', async () => {
    saveTrip.mockResolvedValue({ status: 'saved', id: 'trip-a', version: 1, skipped: false })
    await useStore.getState().saveJourney('Mine')
    expect(saveTrip).toHaveBeenCalledTimes(1)
    expect(saveTrip.mock.calls[0][0]).toMatchObject({ id: 'trip-a', by: 'planner', name: 'Mine' })
    expect(useStore.getState().rows['trip-a'].version).toBe(1)
    expect(useStore.getState().journey?.version).toBe(1)
    expect(outbox.size()).toBe(0)
  })

  it('a save offline goes to the outbox and shows a notice', async () => {
    saveTrip.mockResolvedValue({ status: 'queued', reason: 'offline' })
    await useStore.getState().saveJourney('Mine')
    expect(outbox.size()).toBe(1)
    expect(useStore.getState().notice).toMatch(/no connection/i)
    expect(useStore.getState().saved.some((j) => j.id === 'trip-a')).toBe(true)
  })

  it('an expired session goes to the outbox rather than losing the save', async () => {
    saveTrip.mockResolvedValue({ status: 'queued', reason: 'session' })
    await useStore.getState().saveJourney('Mine')
    expect(outbox.size()).toBe(1)
    expect(outbox.list()[0].row.id).toBe('trip-a')
    expect(useStore.getState().notice).toMatch(/signed out/i)
  })

  it('a later save waits behind earlier ones so versions keep their order', async () => {
    saveTrip.mockResolvedValueOnce({ status: 'queued', reason: 'offline' })
    await useStore.getState().saveJourney('First')
    saveTrip.mockResolvedValue({ status: 'saved', id: 'trip-a', version: 1, skipped: false })
    await useStore.getState().saveJourney('Second')
    expect(saveTrip.mock.calls.map((c) => (c[0] as TripRow).name)).toEqual(['First', 'First', 'Second'])
    expect(outbox.size()).toBe(0)
  })

  it('a save of a trip deleted elsewhere tells the user', async () => {
    saveTrip.mockResolvedValue({ status: 'deleted' })
    await useStore.getState().saveJourney('Mine')
    expect(useStore.getState().notice).toMatch(/deleted in another window/i)
    expect(outbox.size()).toBe(0)
    expect(useStore.getState().rows['trip-a']).toBeUndefined()
  })
})

describe('a change from another window', () => {
  it('a change to the open trip with unsaved edits shows a notice and leaves the edits', () => {
    useStore.getState().applyRemote([stored(1)])
    useStore.getState().openTrip(useStore.getState().saved[0])
    useStore.getState().setJourney({ ...useStore.getState().journey!, name: 'My unsaved edit' })
    useStore.getState().applyRemote([stored(2, 'Changed elsewhere')])
    expect(useStore.getState().journey?.name).toBe('My unsaved edit')
    expect(useStore.getState().notice).toMatch(/your edits are still here/i)
  })

  it('shows the newer version when the open trip has no edits', () => {
    useStore.getState().applyRemote([stored(1)])
    useStore.getState().openTrip(useStore.getState().saved[0])
    useStore.getState().applyRemote([stored(2, 'Changed elsewhere')])
    expect(useStore.getState().journey?.name).toBe('Changed elsewhere')
    expect(useStore.getState().notice).toBeNull()
  })

  it('tells the user when the open trip was deleted elsewhere and keeps it open', () => {
    useStore.getState().applyRemote([stored(1)])
    useStore.getState().openTrip(useStore.getState().saved[0])
    useStore.getState().applyRemote([])
    expect(useStore.getState().journey?.id).toBe('trip-a')
    expect(useStore.getState().notice).toMatch(/deleted in another window/i)
    expect(useStore.getState().saved).toEqual([])
  })

  it('deep link opens any stored trip', () => {
    useStore.getState().applyRemote([stored(1), { ...stored(3, 'Other'), id: 'other-trip' }])
    const link = resolveDeepLink('?trip=other-trip', useStore.getState().saved, null)
    expect(link).toMatchObject({ kind: 'open', journey: { id: 'other-trip', name: 'Other' } })
  })
})

describe('edits made on the map reach the table', () => {
  const flushAll = () => new Promise((r) => setTimeout(r, 0))
  const addLeg = (state: ReturnType<typeof toTripState>, id: string) => ({
    ...state,
    trips: state.trips.map((t) => (t.id === id ? { ...t, legs: [...t.legs, { cid: 'SAL-SJO', from: 'SAL', to: 'SJO', mode: 'bus' as const }] } : t)),
  })

  it('sends a trip edited on the map and leaves the button on Save trip until it is stored', async () => {
    saveTrip.mockResolvedValue({ status: 'saved', id: 'trip-a', version: 2, skipped: false })
    useStore.getState().applyRemote([stored(1)])
    useStore.getState().openTrip(useStore.getState().saved[0])
    const s = useStore.getState()
    s.applyMapTrips(addLeg(toTripState(s.journey, s.saved, true), 'trip-a'))
    await flushAll()
    expect(saveTrip).toHaveBeenCalledTimes(1)
    const sent = saveTrip.mock.calls[0][0] as TripRow
    expect(sent.id).toBe('trip-a')
    expect(sent.places.map((p) => p.node)).toEqual(['GUA', 'SAL', 'SJO'])
    expect(useStore.getState().rows['trip-a'].version).toBe(2)
    // a later reload brings back the same trip, so the edit is still there
    useStore.getState().applyRemote([useStore.getState().rows['trip-a']])
    expect(useStore.getState().saved.find((j) => j.id === 'trip-a')?.places).toHaveLength(3)
  })

  it('stores the trip left behind when the map switches to another trip, and keeps the other one open', async () => {
    saveTrip.mockResolvedValue({ status: 'saved', id: 'trip-a', version: 2, skipped: false })
    useStore.getState().applyRemote([stored(1), { ...stored(1, 'Other'), id: 'other-trip' }])
    useStore.getState().openTrip(useStore.getState().saved.find((j) => j.id === 'trip-a')!)
    useStore.getState().setJourney({ ...useStore.getState().journey!, name: 'Edited on the map' })
    const s = useStore.getState()
    s.applyMapTrips({ ...toTripState(s.journey, s.saved, true), active: 'other-trip' })
    await flushAll()
    const names = saveTrip.mock.calls.map((c) => (c[0] as TripRow).name)
    expect(names).toEqual(['Edited on the map'])
    expect(useStore.getState().journey?.id).toBe('other-trip')
    useStore.getState().applyRemote(Object.values(useStore.getState().rows))
    expect(useStore.getState().saved.find((j) => j.id === 'trip-a')?.name).toBe('Edited on the map')
  })

  it('stores a trip that was made on the map', async () => {
    saveTrip.mockImplementation(async (row: TripRow) => ({ status: 'saved', id: row.id, version: 1, skipped: false }))
    useStore.getState().applyRemote([stored(1)])
    useStore.getState().openTrip(useStore.getState().saved[0])
    const s = useStore.getState()
    const state = toTripState(s.journey, s.saved, true)
    s.applyMapTrips({ trips: [...state.trips, { id: 'new-1', name: 'From the map', legs: [], updated: 1 }], active: 'new-1' })
    await flushAll()
    const sent = saveTrip.mock.calls.map((c) => (c[0] as TripRow).id)
    expect(sent).toContain('new-1')
    expect(useStore.getState().rows['new-1']).toBeDefined()
  })

  it('tells the user when a trip deleted on the map could not be deleted', async () => {
    deleteTrip.mockResolvedValue({ ok: false, message: 'No connection.' })
    useStore.getState().applyRemote([stored(1)])
    const s = useStore.getState()
    s.applyMapTrips({ trips: [], active: null })
    await flushAll()
    expect(useStore.getState().notice).toMatch(/could not be deleted/i)
    expect(useStore.getState().saved.some((j) => j.id === 'trip-a')).toBe(true)
  })
})

describe('what a save leaves on the screen', () => {
  it('a first save leaves the trip with no changes against its own row', async () => {
    saveTrip.mockResolvedValue({ status: 'saved', id: 'trip-a', version: 1, skipped: false })
    await useStore.getState().saveJourney('Mine')
    const s = useStore.getState()
    expect(sameJourney(s.journey!, s.saved.find((j) => j.id === 'trip-a')!)).toBe(true)
  })

  it('a save of another window that is the same content raises no notice', () => {
    useStore.getState().applyRemote([stored(1)])
    useStore.getState().openTrip(useStore.getState().saved[0])
    useStore.getState().setJourney({ ...useStore.getState().journey!, name: 'Same text' })
    useStore.getState().applyRemote([stored(2, 'Same text')])
    expect(useStore.getState().notice).toBeNull()
    expect(useStore.getState().journey?.version).toBe(2)
  })

  it('a save behind waiting saves keeps the screen on the trip and says why it waits', async () => {
    outbox.enqueue(stored(1, 'Earlier'))
    saveTrip.mockResolvedValue({ status: 'queued', reason: 'session' })
    await useStore.getState().saveJourney('Later')
    expect(useStore.getState().notice).toMatch(/signed out/i)
    expect(useStore.getState().journey?.name).toBe('Later')
    expect(useStore.getState().saved.some((j) => j.name === 'Later')).toBe(true)
  })

  it('a trip deleted in another window leaves the list at start', () => {
    useStore.setState({ saved: [trip] })
    useStore.getState().applyRemote([], ['trip-a'])
    expect(useStore.getState().saved).toEqual([])
  })
})

describe('an older version of a trip', () => {
  const latest = () => ({ ...stored(3, 'Latest name'), places: [{ node: 'GUA', hop: null }] }) as unknown as TripRow
  const old = () => stored(2, 'Old name')

  beforeEach(() => {
    useStore.getState().applyRemote([latest()])
    useStore.getState().openTrip(useStore.getState().saved.find((j) => j.id === 'trip-a')!)
  })

  it('opens in the trip view and remembers which version of how many', () => {
    useStore.getState().openVersion(old(), 3)
    const s = useStore.getState()
    expect(s.view).toBe('trip')
    expect(s.journey).toMatchObject({ id: 'trip-a', name: 'Old name', version: 2 })
    expect(s.viewing).toMatchObject({ id: 'trip-a', version: 2, latest: 3 })
  })

  it('does not write the old version as the open draft of this browser', () => {
    const before = localStorage.getItem('latam-planner.current')
    useStore.getState().openVersion(old(), 3)
    expect(localStorage.getItem('latam-planner.current')).toBe(before)
  })

  it('goes back to the latest', () => {
    useStore.getState().openVersion(old(), 3)
    useStore.getState().backToLatest()
    const s = useStore.getState()
    expect(s.viewing).toBeNull()
    expect(s.journey).toMatchObject({ name: 'Latest name', version: 3 })
  })

  it('stays on the old version when the table changes under it', () => {
    useStore.getState().openVersion(old(), 3)
    useStore.getState().applyRemote([{ ...latest(), version: 4 } as TripRow])
    const s = useStore.getState()
    expect(s.journey?.version).toBe(2)
    expect(s.viewing).toMatchObject({ version: 2, latest: 4 })
    expect(s.rows['trip-a'].version).toBe(4)
  })

  it('keeps its own ways when the table changes under it', () => {
    const oldRow = { ...old(), way_in: { ...way('CPH', 'GUA'), price_dkk: 1111 } } as unknown as TripRow
    useStore.getState().openVersion(oldRow, 3)
    useStore.getState().applyRemote([{ ...latest(), version: 4 } as TripRow])
    expect(useStore.getState().data!.inout.ways['trip-a:in'].price_dkk).toBe(1111)
  })

  it('is not written as the open draft when the build is swapped', () => {
    const before = localStorage.getItem(ownKey('latam-planner.current'))
    useStore.getState().openVersion(old(), 3)
    useStore.getState().setData(data)
    expect(localStorage.getItem(ownKey('latam-planner.current'))).toBe(before)
    expect(useStore.getState().journey?.version).toBe(2)
  })

  it('keeps its own ways when the build is swapped', () => {
    const oldRow = { ...old(), way_in: { ...way('CPH', 'GUA'), price_dkk: 1111 } } as unknown as TripRow
    useStore.getState().openVersion(oldRow, 3)
    useStore.getState().setData(data)
    expect(useStore.getState().data!.inout.ways['trip-a:in'].price_dkk).toBe(1111)
  })

  it('is left by opening a trip', () => {
    useStore.getState().openVersion(old(), 3)
    useStore.getState().openTrip(useStore.getState().saved.find((j) => j.id === 'trip-a')!)
    expect(useStore.getState().viewing).toBeNull()
  })

  it('Save stores it as the next version, built on that version, and ends the old view', async () => {
    useStore.getState().openVersion(old(), 3)
    saveTrip.mockResolvedValue({ status: 'saved', id: 'trip-a', version: 4, skipped: false })
    await useStore.getState().saveJourney('Old name')
    expect(saveTrip.mock.calls[0][0]).toMatchObject({ id: 'trip-a', name: 'Old name', version: 3 })
    const s = useStore.getState()
    expect(s.viewing).toBeNull()
    expect(s.journey?.version).toBe(4)
    expect(s.rows['trip-a'].version).toBe(4)
  })
})
