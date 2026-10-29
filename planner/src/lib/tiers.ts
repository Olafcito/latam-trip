/** 1 for the best few, 2 for the next ones, 0 for the rest. */
export type Tier = 0 | 1 | 2

/**
 * Ranks values and splits them into tiers: the best `top` get tier 1, the next `next` get tier 2,
 * everything else tier 0. `order` says which end is best: 'desc' when high is good (a rating),
 * 'asc' when low is good (a price). A value tied with the last one inside a tier joins that tier,
 * so equal values never land in different tiers. Values that are not finite numbers get tier 0.
 */
export function topTiers(values: readonly number[], order: 'asc' | 'desc', top = 10, next = 20): Tier[] {
  const better = (a: number, b: number) => (order === 'desc' ? a > b : a < b)
  const ranked = values.filter(Number.isFinite).sort((a, b) => (order === 'desc' ? b - a : a - b))
  // the value at the edge of each tier, everything as good or better is inside it
  const edge1 = ranked[Math.min(top, ranked.length) - 1]
  const edge2 = ranked[Math.min(top + next, ranked.length) - 1]
  return values.map((v) => {
    if (!Number.isFinite(v)) return 0
    if (top > 0 && edge1 !== undefined && !better(edge1, v)) return 1
    if (top + next > 0 && edge2 !== undefined && !better(edge2, v)) return 2
    return 0
  })
}
