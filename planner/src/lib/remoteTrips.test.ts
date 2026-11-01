import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TripRow } from './repoTrips'

type Reply = { data: unknown; error: { message: string; code: string } | null; status: number }
const calls: [string, { trip: TripRow }][] = []
let reply: (args: { trip: TripRow }) => Promise<Reply> = async () => ({ data: null, error: null, status: 200 })
vi.mock('./supabase', () => ({
  supabase: { rpc: (name: string, args: { trip: TripRow }) => { calls.push([name, args]); return reply(args) } },
  remoteEnabled: () => true,
}))

import { classify, saveTrip } from './remoteTrips'

const flight = { kind: 'flight', from: 'CPH', to: 'GUA', depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10' }
const way = (from: string, to: string) => ({ from, to, depart: '2026-12-02T09:55', arrive: '2026-12-02T22:10', price_dkk: 3900, tickets: [], timeline: [flight] })
const hop = { from: 'GUA', to: 'BOG', mode: 'flight', operator: null, hours: 3, price_dkk: 1200, overnight: false, border: true, flight: null }
const row = {
  id: 'trip-a', version: 1, name: 'A', saved_at: '2026-11-01T10:00:00Z', by: 'planner', why: '',
  way_in: way('CPH', 'GUA'), way_home: way('BOG', 'CPH'), tickets: null,
  places: [{ node: 'GUA', hop: null }, { node: 'BOG', hop }],
} as unknown as TripRow

beforeEach(() => {
  calls.length = 0
})

describe('classify', () => {
  it('tells a lost connection, an expired session and a deleted trip apart', () => {
    expect(classify({ message: 'TypeError: Failed to fetch', code: '' }, true)).toBe('offline')
    expect(classify({ message: 'x', code: 'P0001' }, false)).toBe('offline')
    expect(classify({ message: 'JWT expired', code: 'PGRST303', status: 401 }, true)).toBe('session')
    expect(classify({ message: 'new row violates row-level security policy', code: '42501' }, true)).toBe('session')
    expect(classify({ message: 'trip a was deleted', code: 'P0001' }, true)).toBe('deleted')
    expect(classify({ message: 'something else', code: 'P0001' }, true)).toBe('other')
  })
})

describe('saveTrip', () => {
  it('two saves make two versions', async () => {
    let version = 0
    reply = async (args) => ({ data: { id: args.trip.id, version: ++version, skipped: false }, error: null, status: 200 })
    const a = await saveTrip(row)
    const b = await saveTrip({ ...row, name: 'B' })
    expect([a, b]).toEqual([
      { status: 'saved', id: 'trip-a', version: 1, skipped: false },
      { status: 'saved', id: 'trip-a', version: 2, skipped: false },
    ])
    expect(calls.length).toBe(2)
    expect(calls[0][0]).toBe('save_trip')
  })

  it('answers queued when the connection is gone', async () => {
    reply = async () => ({ data: null, error: { message: 'TypeError: Failed to fetch', code: '' }, status: 0 })
    expect(await saveTrip(row)).toEqual({ status: 'queued', reason: 'offline' })
    reply = () => Promise.reject(new TypeError('Failed to fetch'))
    expect(await saveTrip(row)).toEqual({ status: 'queued', reason: 'offline' })
  })

  it('answers queued with the session as the reason when the session has expired', async () => {
    reply = async () => ({ data: null, error: { message: 'JWT expired', code: 'PGRST303' }, status: 401 })
    expect(await saveTrip(row)).toEqual({ status: 'queued', reason: 'session' })
  })

  it('answers deleted for a trip deleted elsewhere', async () => {
    reply = async () => ({ data: null, error: { message: 'trip trip-a was deleted', code: 'P0001' }, status: 400 })
    expect(await saveTrip(row)).toEqual({ status: 'deleted' })
  })

  it('does not send a row the check would refuse', async () => {
    const r = await saveTrip({ ...row, places: [] })
    expect(r.status).toBe('failed')
    expect(calls.length).toBe(0)
  })
})
