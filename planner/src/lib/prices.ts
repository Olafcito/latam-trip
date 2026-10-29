import type { MapData } from '../data/types'

// Prices by date for the regional flight pairs, from data/web/pair_dates.json (tripdb build).
// The keys are short to keep the file small. data/README.md lists them.

/** One known price on one day. Times are local clock times. */
export interface PairQuote {
  /** price in kr */
  p: number
  /** local departure and arrival, "06:10" */
  d: string | null
  a: string | null
  /** days later it lands, missing when it lands the same day */
  n?: number
  /** hours door to door */
  h: number
  /** airlines */
  c: string[]
  /** stops */
  s: number
  /** where the price came from: momondo, google_flights, expedia, momondo-manual (saved by Simon) */
  src: string | null
  /** when it was last seen, UTC */
  at: string
}

/** "BOG-VVI" to departure date to its quotes, cheapest first. */
export interface PairDates {
  pairs: Record<string, Record<string, PairQuote[]>>
}

/** A price older than this many days is worth checking again. */
export const STALE_DAYS = 3
const DAY_MS = 86_400_000

/** The quotes for one directed pair on one day, cheapest first. Empty when none are known. */
export function pricesOn(pd: PairDates | null | undefined, from: string, to: string, date: string): PairQuote[] {
  const list = pd?.pairs?.[`${from}-${to}`]?.[date] ?? []
  return [...list].sort((x, y) => x.p - y.p || x.h - y.h)
}

/** The newest observation among the quotes, as epoch ms, or null. */
export function newestSeen(quotes: PairQuote[]): number | null {
  let best: number | null = null
  for (const q of quotes) {
    const t = Date.parse(q.at)
    if (Number.isFinite(t) && (best == null || t > best)) best = t
  }
  return best
}

/**
 * none: no price for the day. stale: the newest price is older than STALE_DAYS. fresh otherwise.
 * Both none and stale offer a new search.
 */
export function priceState(quotes: PairQuote[], now: number = Date.now()): 'none' | 'fresh' | 'stale' {
  const t = newestSeen(quotes)
  if (t == null) return 'none'
  return now - t > STALE_DAYS * DAY_MS ? 'stale' : 'fresh'
}

/** "checked 2 days ago", "checked 5 hours ago", "checked just now". */
export function checkedAgo(at: string, now: number = Date.now()): string {
  const t = Date.parse(at)
  if (!Number.isFinite(t)) return 'checked ?'
  const h = Math.max(0, (now - t) / 3_600_000)
  if (h < 1) return 'checked just now'
  if (h < 24) {
    const n = Math.floor(h)
    return `checked ${n} ${n === 1 ? 'hour' : 'hours'} ago`
  }
  const d = Math.floor(h / 24)
  return d === 1 ? 'checked yesterday' : `checked ${d} days ago`
}

const SOURCE: Record<string, string> = {
  momondo: 'Momondo',
  'momondo-manual': 'saved by you',
  google_flights: 'Google Flights',
  expedia: 'Expedia',
  kiwi: 'Kiwi',
  'airline:AV': 'Avianca',
  'airline:CM': 'Copa',
}

/** Where a price came from, as Simon reads it. A price from his Momondo userscript is "saved by you". */
export function sourceLabel(src: string | null | undefined): string {
  if (!src) return '?'
  return SOURCE[src] ?? (src.startsWith('airline:') ? src.slice(8) : src.replace(/_/g, ' '))
}

/** A one-way Momondo search for a leg, cheapest first. */
export function momondoUrl(from: string, to: string, date: string): string {
  return `https://www.momondo.dk/flight-search/${from}-${to}/${date}?sort=price_a`
}

const IATA = /^[A-Z]{3}$/

/** The airport code of a map place or an airport, or null when it has none. */
export function iataOf(map: MapData, id: string): string | null {
  const n = map.nodes.find((x) => x.id === id)
  const code = n?.iata ?? id
  return IATA.test(code) ? code : null
}
