import { describe, expect, it } from 'vitest'
import type { LodgingPrice, LodgingRoom } from '../data/types'
import { latestExact, roomMarks } from './roomMarks'

const price = (over: Partial<LodgingPrice>): LodgingPrice => ({
  id: 'p', room_id: 'r', check_in: '2026-12-08', check_out: '2026-12-11', total_dkk: null, per_night_dkk: 150, site: 'hostelworld', url: null,
  refundable: null, cancel_until: null, available: null, observed_at: '2026-11-05T14:02', ...over,
})
const room = (prices: LodgingPrice[], over: Partial<LodgingRoom> = {}): Pick<LodgingRoom, 'prices' | 'private'> => ({ prices, private: null, ...over })

const IN = '2026-12-08'
const OUT = '2026-12-11'
const NOW = new Date(2026, 10, 5, 16, 0).getTime()

describe('latestExact', () => {
  it('takes the latest seen of the prices for these very dates and none for others', () => {
    const r = room([
      price({ id: 'old', observed_at: '2026-11-01T10:00' }),
      price({ id: 'new', observed_at: '2026-11-04T09:00' }),
      price({ id: 'other', check_out: '2026-12-12', observed_at: '2026-11-05T09:00' }),
    ])
    expect(latestExact(r, IN, OUT)?.id).toBe('new')
    expect(latestExact(r, IN, '2026-12-10')).toBeNull()
  })
})

describe('roomMarks', () => {
  it('has no marks without a price for these dates', () => {
    expect(roomMarks(room([price({ check_in: '2026-12-09' })]), IN, OUT, NOW)).toEqual({ seen: null, left: null, free: null })
  })

  it('has no age mark on a price from today, and says the age in words once it is older, amber when stale', () => {
    expect(roomMarks(room([price({})]), IN, OUT, NOW).seen).toBeNull()
    const day = roomMarks(room([price({ observed_at: '2026-11-04T09:00' })]), IN, OUT, NOW).seen
    expect(day).toEqual({ text: '1 day old', label: 'Seen on Hostelworld 4 Nov 09:00', stale: false })
    const old = roomMarks(room([price({ observed_at: '2026-10-31T08:15', site: null })]), IN, OUT, NOW).seen
    expect(old).toEqual({ text: '5 days old', label: 'Seen 31 Oct 08:15', stale: true })
  })

  it('counts beds in a dorm and rooms in a private, only when few are left', () => {
    expect(roomMarks(room([price({ available: 3 })], { private: false }), IN, OUT, NOW).left).toEqual({ text: '3 left', label: '3 beds left', none: false })
    expect(roomMarks(room([price({ available: 1 })], { private: true }), IN, OUT, NOW).left).toEqual({ text: '1 left', label: '1 room left', none: false })
    expect(roomMarks(room([price({ available: 2 })]), IN, OUT, NOW).left?.label).toBe('2 left')
    expect(roomMarks(room([price({ available: 4 })]), IN, OUT, NOW).left).toBeNull()
    expect(roomMarks(room([price({ available: null })]), IN, OUT, NOW).left).toBeNull()
    expect(roomMarks(room([price({ available: 0 })]), IN, OUT, NOW).left).toMatchObject({ text: 'Sold out', none: true })
  })

  it('marks free cancellation with its last day, and nothing for a price that does not refund', () => {
    expect(roomMarks(room([price({ refundable: 'yes', cancel_until: '2026-12-06T23:59' })]), IN, OUT, NOW).free)
      .toEqual({ text: 'Free until 6 Dec', label: 'Free cancellation until 6 Dec' })
    expect(roomMarks(room([price({ refundable: 'yes' })]), IN, OUT, NOW).free?.text).toBe('Free cancellation')
    expect(roomMarks(room([price({ refundable: 'partly', cancel_until: '2026-12-06' })]), IN, OUT, NOW).free).toBeNull()
  })

  it('reads the marks from the latest price only', () => {
    const r = room([
      price({ observed_at: '2026-11-01T10:00', refundable: 'yes', available: 1 }),
      price({ observed_at: '2026-11-05T14:02', refundable: 'no', available: 9 }),
    ])
    expect(roomMarks(r, IN, OUT, NOW)).toMatchObject({ left: null, free: null, seen: null })
  })
})
