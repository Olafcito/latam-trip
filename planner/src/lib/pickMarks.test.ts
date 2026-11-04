import { describe, expect, it } from 'vitest'
import type { TimelineItem, Way } from '../data/types'
import { bagWords, carriersOf, flightNumbersOf, legEnds, lossLabel, pairMarks, stopsLabel } from './pickMarks'

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
    expect(lossLabel({ kind: 'long', points: 1 })).toBe('Long flight, over 20 hours')
    expect(lossLabel({ kind: 'long', points: 2 })).toBe('Long flight, over 23 hours')
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
      { kind: 'change', label: 'Change of tickets, both ways' },
      { kind: 'us', label: 'US transit, way in' },
      { kind: 'long', label: 'Long flight, over 23 hours, way home' },
    ])
  })
})

const fly = (carriers: string[], flight_numbers?: string[]): TimelineItem =>
  ({ kind: 'flight', from: 'CPH', to: 'MAD', depart: '', arrive: '', hours: 3, connections: [], carriers, flight_numbers, overnight_layover: false, self_transfer_inside: false, ticket: 'TEST01' })

describe('the words of a way', () => {
  it('counts the stops from the flights', () => {
    expect(stopsLabel(way({ flights: 1 }))).toBe('Direct')
    expect(stopsLabel(way({ flights: 2 }))).toBe('1 stop')
    expect(stopsLabel(way({ flights: 4 }))).toBe('3 stops')
  })

  it('names each airline once and falls back to it for a flight without numbers', () => {
    const w = way({ timeline: [fly(['Iberia'], ['Iberia 1']), fly(['Iberia', ' ']), fly([], [])] })
    expect(carriersOf(w)).toEqual(['Iberia'])
    expect(flightNumbersOf(w)).toEqual(['Iberia 1', 'Iberia'])
  })
})

describe('the words of a ticket', () => {
  it('splits a leg into its airports', () => {
    expect(legEnds('CPH>MAD')).toEqual(['CPH', 'MAD'])
    expect(legEnds('Madrid to Bogota')).toBeNull()
  })

  it('puts a bag in plain words', () => {
    expect(bagWords(null, null)).toBe('not known')
    expect(bagWords('unknown', null)).toBe('not known')
    expect(bagWords('1 carry-on', 0)).toBe('1 carry-on')
    expect(bagWords('incl', null, true)).toBe('included')
    expect(bagWords('none', null, true)).toBe('not included')
    expect(bagWords('paid', null, true)).toBe('paid, fee not known')
    expect(bagWords('paid', 300, true)).toBe('paid, 300 kr')
  })
})
