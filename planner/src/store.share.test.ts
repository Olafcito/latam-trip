import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData } from './data/types'
import type { Journey } from './lib/journey'
import type { TripRow } from './lib/repoTrips'

const saveTrip = vi.fn()
vi.mock('./lib/supabase', () => ({ remoteEnabled: () => true, supabase: null }))
vi.mock('./lib/remoteTrips', () => ({
  saveTrip: (...a: unknown[]) => saveTrip(...a),
  deleteTrip: vi.fn(),
  sendQueued: async (row: TripRow) => {
    await saveTrip(row)
    return { status: 'saved' }
  },
}))

import { ownKey } from '@map/data/ownKey'
import { CURRENT_KEY, useStore } from './store'
import { sharedJourneyId } from './lib/shareTrip'

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

const mine: Journey = { id: 'trip-a', name: 'Mine', wayIn: 'in', wayHome: 'home', optionId: null, places: [{ node: 'GUA', hop: null }] }
const tok = 'AbCdEfGhIjKlMnOpQrStUv'
const sharedRow = {
  id: sharedJourneyId(tok), version: 4, rank: 2, name: 'TEST01', saved_at: '2026-11-01T10:00:00Z', by: '', why: '',
  way_in: way('CPH', 'GUA'), way_home: way('SAL', 'CPH'), tickets: null,
  places: [{ node: 'GUA', hop: null, stays: [{ id: 'x' }] }, { node: 'SAL', hop: null }],
} as unknown as TripRow

beforeEach(() => {
  ;(globalThis as { localStorage?: unknown }).localStorage = fakeStorage()
  saveTrip.mockReset()
  useStore.setState({ rows: {}, saved: [], repo: [], notice: null, journey: null, shared: null, mapOpen: true })
  useStore.getState().setData(data)
  useStore.getState().setJourney(mine)
})

describe('a shared trip', () => {
  it('opens read only on the Trips tab and leaves the draft alone', () => {
    useStore.getState().openShared(tok, sharedRow)
    const s = useStore.getState()
    expect(s.journey?.id).toBe(sharedJourneyId(tok))
    expect(s.shared?.token).toBe(tok)
    expect([s.screen, s.view, s.mapOpen]).toEqual(['trips', 'trip', false])
    expect(s.data?.inout.ways[`${sharedJourneyId(tok)}:in`]).toBeTruthy()
    expect(JSON.parse(localStorage.getItem(ownKey(CURRENT_KEY))!).id).toBe('trip-a')
  })

  it('takes no edits and no save', async () => {
    useStore.getState().openShared(tok, sharedRow)
    const j = useStore.getState().journey!
    useStore.getState().setJourney({ ...j, name: 'changed' })
    expect(useStore.getState().journey?.name).toBe('TEST01')
    await useStore.getState().saveJourney('changed')
    expect(saveTrip).not.toHaveBeenCalled()
    expect(JSON.parse(localStorage.getItem(ownKey(CURRENT_KEY))!).id).toBe('trip-a')
  })

  it('is left for the draft this browser had open', () => {
    useStore.getState().openShared(tok, sharedRow)
    useStore.getState().go('map')
    const s = useStore.getState()
    expect(s.shared).toBeNull()
    expect(s.journey?.id).toBe('trip-a')
  })

  it('is kept as a new trip of your own, with its ways and without the owner rank, versions or stays', async () => {
    saveTrip.mockImplementation(async (row: TripRow) => ({ status: 'saved', id: row.id, version: 1, skipped: false }))
    useStore.getState().openShared(tok, sharedRow)
    await useStore.getState().keepShared()
    const s = useStore.getState()
    expect(s.shared).toBeNull()
    const id = s.journey!.id
    expect(id).not.toBe(sharedJourneyId(tok))
    expect(id).not.toBe('trip-a')
    expect(s.journey?.rank).toBeUndefined()
    expect(s.journey?.places.some((p) => 'stays' in p)).toBe(false)
    expect(s.data?.inout.ways[`${id}:in`]).toBeTruthy()
    expect(saveTrip).toHaveBeenCalledTimes(1)
    expect(saveTrip.mock.calls[0][0]).toMatchObject({ id, name: 'TEST01' })
  })
})
