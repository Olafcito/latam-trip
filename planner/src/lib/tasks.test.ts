import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const inserts: Row[] = []
let handler: (cb: () => void) => void = () => {}
let fail: string | null = null
vi.mock('./supabase', () => ({
  remoteEnabled: () => true,
  supabase: {
    from: () => ({
      insert: (row: Row) => {
        inserts.push(row)
        return { select: () => ({ single: async () => (fail ? { data: null, error: { message: fail } } : { data: { id: 10000 + inserts.length }, error: null }) }) }
      },
    }),
    channel: () => ({
      on: (_k: string, _f: unknown, cb: () => void) => {
        handler(cb)
        return { subscribe: () => ({}) }
      },
    }),
    removeChannel: () => {},
  },
}))

import { askLabel, flightPricesTask, insertTask, press, subscribeTasks } from './tasks'

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
})
