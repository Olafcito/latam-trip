/**
 * The rooms cheapest first, for a list of the rooms of a place. Rooms with no price come after the priced ones.
 * Rooms with equal prices, and the unpriced rooms among themselves, keep their order. The input is not changed.
 */
export function cheapestFirst<T>(rooms: T[], price: (r: T) => number | null | undefined): T[] {
  return [...rooms].sort((a, b) => {
    const x = price(a)
    const y = price(b)
    if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0)
    return x - y
  })
}
