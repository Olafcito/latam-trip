import { describe, expect, it } from 'vitest'
import { deltas, differingStops, nightsGrid, sameAll } from './tripCompare'

describe('deltas', () => {
  it('is each total against the cheapest known one', () => {
    expect(deltas([12000, 10500, 11000])).toEqual([1500, 0, 500])
  })
  it('leaves an unknown total out', () => {
    expect(deltas([null, 9000, 9400])).toEqual([null, 0, 400])
  })
  it('has nothing to say with fewer than two known totals', () => {
    expect(deltas([null, 9000])).toEqual([null, null])
  })
})

describe('sameAll', () => {
  it('is true when every trip has the same value', () => {
    expect(sameAll([3, 3, 3])).toBe(true)
    expect(sameAll([null, null])).toBe(true)
    expect(sameAll([{ a: 1 }, { a: 1 }])).toBe(true)
  })
  it('is false when one differs, an unknown included', () => {
    expect(sameAll([3, 4])).toBe(false)
    expect(sameAll([3, null])).toBe(false)
  })
})

describe('nightsGrid', () => {
  it('lists the countries in the order the first trip meets them, then the new ones of the others', () => {
    const g = nightsGrid([
      { order: ['CO', 'BO'], days: { CO: 20, BO: 30 } },
      { order: ['SV', 'CO', 'BO'], days: { SV: 6, CO: 18, BO: 26 } },
    ])
    expect(g).toEqual([
      { country: 'CO', nights: [20, 18] },
      { country: 'BO', nights: [30, 26] },
      { country: 'SV', nights: [null, 6] },
    ])
  })
  it('adds a country that has nights but no stop, a hub night, at the end', () => {
    const g = nightsGrid([{ order: ['CO'], days: { CO: 20, US: 1 } }])
    expect(g.map((r) => r.country)).toEqual(['CO', 'US'])
  })
  it('shows a country with no nights as unknown, never 0', () => {
    const g = nightsGrid([{ order: ['GT', 'CO'], days: { GT: 0, CO: 20 } }, { order: ['CO'], days: { CO: 20 } }])
    expect(g[0]).toEqual({ country: 'GT', nights: [null, null] })
  })
})

describe('differingStops', () => {
  it('gives each trip the stops another trip lacks', () => {
    expect(differingStops([
      ['Cartagena', 'La Paz', 'Cochabamba'],
      ['Cartagena', 'La Paz', 'Cochabamba', 'Medellín'],
    ])).toEqual([[], ['Medellín']])
  })
  it('counts a stop in two of three trips as a difference for both', () => {
    expect(differingStops([['A', 'B'], ['A', 'C'], ['A', 'B']])).toEqual([['B'], ['C'], ['B']])
  })
  it('lists a stop once even when the trip comes back to it', () => {
    expect(differingStops([['A', 'B', 'A', 'B'], ['A']])).toEqual([['B'], []])
  })
})
