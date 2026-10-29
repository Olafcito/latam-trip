import { neighbours, type Model } from '@map/data/model'
import { familyOf, type Family, type Place, type RouteOption } from '@map/data/types'
import type { TripLeg } from '@map/data/trips'

// The places one leg away from a stop, by the modes switched on on the map: the same set the map
// lights for the stop. One row per place and mode, so a city with a bus and a flight shows twice.

export interface ReachRow {
  key: string
  place: Place
  family: Family
  /** the fastest option of that mode, null when no option has a duration */
  hours: number | null
  /** the cheapest known price of that mode in kr, null when none is known */
  price: number | null
  /** the leg to add, as a tap on the lit city adds it */
  leg: TripLeg
}

const priceOf = (o: RouteOption): number | null => o.price_dkk.min ?? o.price_dkk.typical ?? o.researched?.price_min ?? null

/** Rows for every place reachable from `here` by the switched on modes, fastest first. */
export function reachFrom(model: Model, here: string, families: Set<Family>): ReachRow[] {
  const rows: ReachRow[] = []
  for (const n of neighbours(model, here, families)) {
    const byFamily = new Map<Family, RouteOption[]>()
    for (const o of n.options) {
      const f = familyOf(o.mode)
      byFamily.set(f, [...(byFamily.get(f) ?? []), o])
    }
    for (const [family, opts] of byFamily) {
      // the options come fastest first, so the first one is the leg a tap would take
      const best = opts[0]
      const prices = opts.map(priceOf).filter((p): p is number => p != null)
      const mins = best.duration_min
      rows.push({
        key: `${n.other.id}:${family}`,
        place: n.other,
        family,
        hours: mins == null ? null : mins / 60,
        price: prices.length ? Math.min(...prices) : null,
        leg: { cid: n.conn.id, from: here, to: n.other.id, mode: best.mode },
      })
    }
  }
  return rows.sort(
    (x, y) => (x.hours ?? Infinity) - (y.hours ?? Infinity) || (x.price ?? Infinity) - (y.price ?? Infinity) || x.place.name.localeCompare(y.place.name),
  )
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/** The rows whose place or country name holds the search, ignoring case and accents. */
export function filterReach(rows: ReachRow[], query: string, countryName: (code: string) => string): ReachRow[] {
  const q = fold(query.trim())
  if (!q) return rows
  return rows.filter((r) => fold(`${r.place.name} ${r.place.short_name} ${countryName(r.place.country)}`).includes(q))
}
