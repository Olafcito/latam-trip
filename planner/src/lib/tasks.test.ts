import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown>
const inserts: Row[] = []
let fail: string | null = null
const feeds: { tables: readonly string[]; cb: () => void; stopped: boolean }[] = []
vi.mock('./supabase', () => ({
  remoteEnabled: () => true,
  supabase: {
    from: () => ({
      insert: (row: Row) => {
        inserts.push(row)
        return { select: () => ({ single: async () => (fail ? { data: null, error: { message: fail } } : { data: { id: 10000 + inserts.length }, error: null }) }) }
      },
    }),
  },
}))
vi.mock('./ownerFeed', () => ({
  onOwnerChange: (tables: readonly string[], cb: () => void) => {
    const feed = { tables, cb, stopped: false }
    feeds.push(feed)
    return () => {
      feed.stopped = true
    }
  },
}))

import { alreadyQueued, askLabel, flightPricesTask, insertTask, localDay, press, stayFindTask, stayMarks, stayPicksTask, stayPricesTask, subscribeTasks, wantsPicks, type StayTask } from './tasks'

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

  it('a result shows in place when a task of the person changes', () => {
    feeds.length = 0
    const seen: string[] = []
    const stop = subscribeTasks(() => seen.push('changed'))
    expect(feeds.map((f) => f.tables)).toEqual([['tasks']])
    feeds[0].cb()
    expect(seen).toEqual(['changed'])
    stop()
    expect(feeds[0].stopped).toBe(true)
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

describe('stay picks (FEAT-004)', () => {
  const at = (type: StayTask['type'], status: StayTask['status'], check_in = '2026-12-10', check_out = '2026-12-14', id = 1): StayTask => ({ id, type, status, check_in, check_out })
  const base = { nights: 3, booked: false, checkIn: '2026-12-10', checkOut: '2026-12-14', today: '2026-11-06', hasBooking: false, tasks: [] as StayTask[] }

  it('queues the picks at a stop with nights, no Booking.com place and no picks yet', () => {
    expect(wantsPicks(base)).toBe(true)
    expect(wantsPicks({ ...base, tasks: [at('stay_search', 'open')] })).toBe(true)
  })

  it('queues nothing for a stop without nights, booked, past, or with a Booking.com place', () => {
    expect(wantsPicks({ ...base, nights: 0 })).toBe(false)
    expect(wantsPicks({ ...base, booked: true })).toBe(false)
    expect(wantsPicks({ ...base, today: '2026-12-11' })).toBe(false)
    expect(wantsPicks({ ...base, hasBooking: true })).toBe(false)
  })

  it('queues the picks once per place and dates, whether the first is open, done or failed', () => {
    for (const s of ['open', 'working', 'done', 'failed'] as const) expect(wantsPicks({ ...base, tasks: [at('stay_picks', s)] })).toBe(false)
  })

  it('waits while picks for other dates are under way, and queues new dates once they closed', () => {
    expect(wantsPicks({ ...base, tasks: [at('stay_picks', 'working', '2026-12-11', '2026-12-14')] })).toBe(false)
    expect(wantsPicks({ ...base, tasks: [at('stay_picks', 'done', '2026-12-11', '2026-12-14')] })).toBe(true)
  })

  it('marks the pressed search and the picks apart, so a press still works while the picks run', () => {
    expect(stayMarks([at('stay_picks', 'open')], '2026-12-10', '2026-12-14')).toEqual({ search: false, picks: true })
    expect(stayMarks([at('stay_search', 'working'), at('stay_picks', 'done')], '2026-12-10', '2026-12-14')).toEqual({ search: true, picks: false })
    expect(stayMarks([at('stay_search', 'open', '2026-12-11')], '2026-12-10', '2026-12-14')).toEqual({ search: false, picks: false })
  })

  it('reads the refusal of a second picks row as queued', () => {
    expect(alreadyQueued('duplicate key value violates unique constraint "tasks_stay_picks_once"')).toBe(true)
    expect(alreadyQueued('Failed to fetch')).toBe(false)
  })

  it('a picks task carries the place and dates', () => {
    const d = stayPicksTask({ id: 'ADZ', name: 'San Andres' }, '2026-12-08', '2026-12-13')
    expect(d.task).toEqual({ type: 'stay_picks', place_id: 'ADZ', check_in: '2026-12-08', check_out: '2026-12-13', from: 'app' })
    expect(d.title.startsWith('[stay_picks] San Andres')).toBe(true)
  })

  it('the local day is the calendar date', () => {
    expect(localDay(new Date(2026, 10, 6, 23, 30))).toBe('2026-11-06')
  })
})
