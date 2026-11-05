import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const inserts: Row[] = []
let handler: (cb: () => void) => void = () => {}
let fail: string | null = null
const topics: string[] = []
vi.mock('./supabase', () => ({
  remoteEnabled: () => true,
  supabase: {
    from: () => ({
      insert: (row: Row) => {
        inserts.push(row)
        return { select: () => ({ single: async () => (fail ? { data: null, error: { message: fail } } : { data: { id: 10000 + inserts.length }, error: null }) }) }
      },
    }),
    channel: (topic: string) => (topics.push(topic), {
      on: (_k: string, _f: unknown, cb: () => void) => {
        handler(cb)
        return { subscribe: () => ({}) }
      },
    }),
    removeChannel: () => {},
  },
}))

import { askLabel, flightPricesTask, insertTask, press, stayFindTask, stayPricesTask, subscribeTasks } from './tasks'

const draft = flightPricesTask({ from: 'BOG', to: 'VVI', date: '2027-01-28', fromName: 'Bogota', toName: 'Santa Cruz' })

beforeEach(() => {
  inserts.length = 0
  fail = null
})

describe('tasks', () => {
  it('one press inserts one row and the button says sent', async () => {
    let state: 'idle' | 'sending' | 'sent' | 'failed' = 'idle'
    const send = () => insertTask(draft, 'trip-a', 3)
    let r = await press(state, send)
    state = r.state
    expect(state).toBe('sent')
    expect(askLabel(state)).toBe('Sent to Claude')
    r = await press(state, send)
    r = await press(r.state, send)
    expect(inserts.length).toBe(1)
  })

  it('the row carries trip_id and trip_version', async () => {
    await insertTask(draft, 'trip-a', 3)
    expect(inserts[0]).toMatchObject({ type: 'flight_prices', trip_id: 'trip-a', trip_version: 3, title: '[flight_prices] BOG to VVI 28 Jan' })
    expect((inserts[0].data as Row).legs).toEqual([{ from: 'BOG', to: 'VVI', date: '2027-01-28', flex_days: 3 }])
  })

  it('a refused insert shows the reason and can be pressed again', async () => {
    fail = 'new row violates row-level security policy'
    const r = await press('idle', () => insertTask(draft, 'trip-a', 1))
    expect(r).toEqual({ state: 'failed', error: fail })
    expect(askLabel(r.state)).toBe('Try again')
    expect((await press(r.state, () => insertTask(draft, 'trip-a', 1))).state).toBe('failed')
    expect(inserts.length).toBe(2)
  })

  it('a result shows in place when the table changes', () => {
    let fire: () => void = () => {}
    handler = (cb) => {
      fire = cb
    }
    const seen: string[] = []
    const stop = subscribeTasks(() => seen.push('changed'))
    fire()
    expect(seen).toEqual(['changed'])
    stop()
  })

  it('a sheet opened again listens on a channel of its own', () => {
    // the client hands back a channel of the same name that is still subscribed, and adding to it throws
    topics.length = 0
    subscribeTasks(() => {})()
    subscribeTasks(() => {})()
    expect(topics.length).toBe(2)
    expect(topics[0]).not.toBe(topics[1])
  })
  it('a stay price task names the place, its rooms and the nights, as tasks.py needs them', () => {
    const d = stayPricesTask({ id: 'TEST01', name: 'Casa Test' }, [{ id: 'r1', name: 'Dorm' }, { id: 'r2', name: 'Double' }], '2026-12-09', 5)
    expect(d.task).toEqual({ type: 'stay_prices', lodging_id: 'TEST01', room_ids: ['r1', 'r2'], check_in: '2026-12-09', check_out: '2026-12-14', from: 'app' })
    expect(d.title).toBe('[stay_prices] Casa Test 9 to 14 Dec')
    expect(d.line).toBe('Prices of 2 rooms at Casa Test for 9 to 14 Dec.')
    expect(stayPricesTask({ id: 'TEST01', name: 'Casa Test' }, [{ id: 'r1', name: 'Dorm' }], '2026-12-30', 3).line).toBe('Prices of Dorm at Casa Test for 30 Dec to 2 Jan.')
  })
  it('a stay search task names the stop and its dates, as tasks.py needs them', async () => {
    const d = stayFindTask({ id: 'ADZ', name: 'San Andres' }, '2026-12-08', '2026-12-13')
    expect(d.task).toEqual({ type: 'stay_search', place_id: 'ADZ', check_in: '2026-12-08', check_out: '2026-12-13', top: 3, from: 'app' })
    expect(d.title).toBe('[stay_search] San Andres 8 to 13 Dec')
    expect(d.line).toBe('The 3 most reviewed places on Booking.com in San Andres for 8 to 13 Dec.')
    await insertTask(d, 'trip-a', 2)
    expect(inserts[0]).toMatchObject({ type: 'stay_search', trip_id: 'trip-a', trip_version: 2, title: '[stay_search] San Andres 8 to 13 Dec' })
    expect(inserts[0].data).toMatchObject({ place_id: 'ADZ', top: 3, note: d.line })
  })
})
