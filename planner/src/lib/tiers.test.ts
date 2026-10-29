import { describe, expect, it } from 'vitest'
import { topTiers } from './tiers'

const count = (tiers: number[], t: number) => tiers.filter((x) => x === t).length

describe('topTiers', () => {
  it('gives the best 10 tier 1, the next 20 tier 2 and the rest tier 0', () => {
    const values = Array.from({ length: 50 }, (_, i) => i)
    const tiers = topTiers(values, 'desc')
    expect(count(tiers, 1)).toBe(10)
    expect(count(tiers, 2)).toBe(20)
    expect(count(tiers, 0)).toBe(20)
    expect(tiers[49]).toBe(1)
    expect(tiers[40]).toBe(1)
    expect(tiers[39]).toBe(2)
    expect(tiers[20]).toBe(2)
    expect(tiers[19]).toBe(0)
  })

  it('treats low as best when the order is ascending, as with a price', () => {
    const prices = [9000, 6000, 7000, 12000]
    expect(topTiers(prices, 'asc', 1, 2)).toEqual([2, 1, 2, 0])
    expect(topTiers(prices, 'desc', 1, 2)).toEqual([2, 0, 2, 1])
  })

  it('keeps the input order', () => {
    expect(topTiers([3, 1, 2], 'desc', 1, 1)).toEqual([1, 0, 2])
  })

  it('lets a tie at the edge join the better tier, so equal values match', () => {
    expect(topTiers([7, 8, 8, 6, 5], 'desc', 2, 1)).toEqual([2, 1, 1, 0, 0])
    // three share the top, so they fill the next tier's one place as well
    expect(topTiers([7, 8, 8, 8, 5], 'desc', 2, 1)).toEqual([0, 1, 1, 1, 0])
  })

  it('fills only what exists when there are fewer values than the tiers', () => {
    expect(topTiers([1, 2, 3], 'desc')).toEqual([1, 1, 1])
    expect(topTiers([], 'asc')).toEqual([])
    expect(topTiers(Array.from({ length: 15 }, (_, i) => i), 'asc').filter((t) => t === 2)).toHaveLength(5)
  })

  it('leaves values that are not numbers out of the ranking', () => {
    expect(topTiers([NaN, 5, Infinity, 4], 'desc', 1, 1)).toEqual([0, 1, 0, 2])
  })
})
