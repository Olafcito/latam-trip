import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from './data/types'
import type { Hop, Journey } from './lib/journey'
import type { TripRow } from './lib/repoTrips'
import { resolveDeepLink } from './lib/repoTrips'

const saveTrip = vi.fn()
const deleteTrip = vi.fn()
vi.mock('./lib/supabase', () => ({ remoteEnabled: () => true, supabase: null }))
vi.mock('./lib/remoteTrips', () => ({
  saveTrip: (...a: unknown[]) => saveTrip(...a),
  deleteTrip: (...a: unknown[]) => deleteTrip(...a),
  sendQueued: async (row: TripRow) => {
    const r = (await saveTrip(row)) as { status: string }
    return r.status === 'saved' ? { status: 'saved' } : r.status === 'queued' ? { status: 'queued' } : { status: 'deleted' }
  },
}))

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
