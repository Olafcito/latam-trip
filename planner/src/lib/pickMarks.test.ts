import { describe, expect, it } from 'vitest'
import type { Way } from '../data/types'
import { lossLabel, pairMarks } from './pickMarks'

const way = (over: Partial<Way>): Way => ({
  id: 'I1', direction: 'in', type: 'oneways', from: 'CPH', to: 'CTG', depart: '2026-12-03T06:00', arrive: '2026-12-03T14:30',
  total_hours: 14.5, flying_hours: 14.5, flights: 2, hub_nights: 0, changes: 0, us_transit: false, airports: ['CPH', 'CTG'],
  tickets: ['TEST01'], price_dkk: 0,
  extras: { cabin_bag_fees_dkk: 0, checked_bag_fees_dkk: 0, hub_nights: 0, hub_stay_estimate_dkk: 0 },
  score: 5, timeline: [], ...over,
})

describe('lossLabel', () => {
  it('says each loss in words', () => {
    expect(lossLabel({ kind: 'night', points: 1 })).toBe('1 hub night')
    expect(lossLabel({ kind: 'night', points: 3 })).toBe('3 hub nights')
    expect(lossLabel({ kind: 'long', points: 1 })).toBe('Over 20 hours flying')
    expect(lossLabel({ kind: 'long', points: 2 })).toBe('Over 23 hours flying')
  })
})

describe('pairMarks', () => {
  it('is empty for two clean ways', () => {
    expect(pairMarks(way({}), way({ direction: 'home' }))).toEqual([])
  })

  it('adds up the hub nights of both ways', () => {
    expect(pairMarks(way({ hub_nights: 1 }), way({ hub_nights: 2 }))).toEqual([{ kind: 'night', label: '3 hub nights', text: '3' }])
  })

  it('names the way a mark sits on, or both', () => {
    const marks = pairMarks(way({ us_transit: true, changes: 1 }), way({ changes: 2, flying_hours: 24 }))
    expect(marks).toEqual([
      { kind: 'change', label: 'A change between separate tickets, both ways' },
      { kind: 'us', label: 'Through the United States, way in' },
      { kind: 'long', label: 'Over 23 hours flying, way home' },
    ])
  })
})
