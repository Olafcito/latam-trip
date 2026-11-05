import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RatesResult } from '../../lib/stayRates'

const fetchRates = vi.fn<(id: string, a: string, b: string) => Promise<RatesResult>>()
vi.mock('../../lib/stayRates', () => ({ fetchRates: (id: string, a: string, b: string) => fetchRates(id, a, b), liveLink: () => null }))

const { askLive } = await import('./useLiveRates')

const LINK = 'https://www.hostelworld.com/pwa/hosteldetails.php/A/B/123456'
const tick = () => new Promise((r) => setTimeout(r, 0))

afterEach(() => fetchRates.mockReset())

describe('askLive', () => {
  it('is off and asks nothing for a place without a Hostelworld link', () => {
    const states: unknown[] = []
    askLive('l1', null, '2026-12-10', '2026-12-13', (s) => states.push(s))
    expect(states).toEqual([{ state: 'off' }])
    expect(fetchRates).not.toHaveBeenCalled()
  })

  it('asks at once for the place and dates, then is done', async () => {
    fetchRates.mockResolvedValue({ ok: true, lodging_id: 'l1', fetched: true, rooms: 2, prices: 2 })
    const states: unknown[] = []
    askLive('l1', LINK, '2026-12-10', '2026-12-13', (s) => states.push(s))
    expect(states).toEqual([{ state: 'asking' }])
    expect(fetchRates).toHaveBeenCalledWith('l1', '2026-12-10', '2026-12-13')
    await tick()
    expect(states).toEqual([{ state: 'asking' }, { state: 'done' }])
  })

  it('a failure carries its message, and a thrown call a plain one', async () => {
    fetchRates.mockResolvedValueOnce({ ok: false, message: 'Hostelworld has no beds for these dates.' })
    const states: unknown[] = []
    askLive('l1', LINK, '2026-12-10', '2026-12-13', (s) => states.push(s))
    await tick()
    expect(states.at(-1)).toEqual({ state: 'failed', message: 'Hostelworld has no beds for these dates.' })

    fetchRates.mockRejectedValueOnce(new Error('offline'))
    askLive('l1', LINK, '2026-12-10', '2026-12-13', (s) => states.push(s))
    await tick()
    expect(states.at(-1)).toEqual({ state: 'failed', message: 'Hostelworld could not be asked right now.' })
  })

  it('tells nothing more once stopped, so a closed pane is left alone', async () => {
    fetchRates.mockResolvedValue({ ok: true, lodging_id: 'l1', fetched: true, rooms: 1, prices: 1 })
    const states: unknown[] = []
    const stop = askLive('l1', LINK, '2026-12-10', '2026-12-13', (s) => states.push(s))
    stop()
    await tick()
    expect(states).toEqual([{ state: 'asking' }])
  })
})
