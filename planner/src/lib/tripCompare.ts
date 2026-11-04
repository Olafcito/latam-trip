// What compare needs to lead with difference: each total against the cheapest, whether a line is the
// same in every trip, the nights per country as a grid and the stops that are not in every trip.

const known = (n: number | null): n is number => n != null && Number.isFinite(n)

/** Each total minus the cheapest known one. Nothing when fewer than two totals are known. */
export function deltas(totals: readonly (number | null)[]): (number | null)[] {
  const k = totals.filter(known)
  if (k.length < 2) return totals.map(() => null)
  const min = Math.min(...k)
  return totals.map((t) => (known(t) ? t - min : null))
}

/** True when every trip holds the same value. An unknown is a value of its own. */
export function sameAll(values: readonly unknown[]): boolean {
  const first = JSON.stringify(values[0] ?? null)
  return values.every((v) => JSON.stringify(v ?? null) === first)
}

export interface GridRow {
  country: string
  /** the nights per trip, null where the trip sleeps none there */
  nights: (number | null)[]
}

/**
 * The nights per country of every trip. Countries run in the order the first trip meets them, then the
 * ones only later trips meet, then countries with nights and no stop, like a night at a hub.
 */
export function nightsGrid(trips: readonly { order: string[]; days: Record<string, number> }[]): GridRow[] {
  const seen: string[] = []
  const add = (c: string) => { if (!seen.includes(c)) seen.push(c) }
  trips.forEach((t) => t.order.forEach(add))
  trips.forEach((t) => Object.keys(t.days).forEach(add))
  return seen.map((country) => ({ country, nights: trips.map((t) => (t.days[country] ? t.days[country] : null)) }))
}

/** For each trip, the stops at least one other trip does not have, each once, in trip order. */
export function differingStops(routes: readonly string[][]): string[][] {
  const sets = routes.map((r) => new Set(r))
  return routes.map((r) => {
    const out: string[] = []
    for (const s of r) if (!out.includes(s) && sets.some((o) => !o.has(s))) out.push(s)
    return out
  })
}
