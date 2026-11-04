// The pairs of the way picker: every way in and way home that leave from one home, one row per pair of
// cities, ranked by the project's score or by the all in price, with what each pair loses points for.
import type { Airport, InOut, Option, Rating, Ticket, Way, WayType } from '../data/types'
import { mixWays, type Filters } from './options'
import { ticketLink, type FlightLink } from './links'

/** An option as the build writes it: the all in price and the score on it ride along, outside the shared types. */
export type FullOption = Option & { total_dkk?: number; rating: Rating & { on_total?: number } }

export type PairSort = 'best' | 'cheapest'

/** The filters the picker shows. The stored price, rating, hours and type filters are left out on purpose. */
export type PairFilters = Pick<Filters, 'arrival' | 'departure' | 'noUS' | 'maxHubNights'>

export const REGION_ORDER = ['CA', 'CO', 'MX', 'BO']

/** Flights, cabin bags and hub stays. The build's own total when it has one. An unknown fee adds nothing. */
export function allIn(o: Option): number {
  const t = (o as FullOption).total_dkk
  if (t != null && Number.isFinite(t)) return t
  return o.price_dkk + (o.extras.cabin_bag_fees_dkk ?? 0) + (o.extras.hub_stay_estimate_dkk ?? 0)
}

export type LossKind = 'night' | 'change' | 'us' | 'long'
export interface Loss { kind: LossKind; points: number }

/** What a way loses of its 5, after `inout.rating.way_score`: a point a hub night, a change between tickets, the United States, over 20 and over 23 hours flying. */
export function pointsLost(w: Way): Loss[] {
  const out: Loss[] = []
  if (w.hub_nights > 0) out.push({ kind: 'night', points: w.hub_nights })
  if (w.changes > 0) out.push({ kind: 'change', points: 1 })
  if (w.us_transit) out.push({ kind: 'us', points: 1 })
  const long = (w.flying_hours > 20 ? 1 : 0) + (w.flying_hours > 23 ? 1 : 0)
  if (long) out.push({ kind: 'long', points: long })
  return out
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** The score out of 10 as its parts: price out of 5, the way home out of 3, the way in out of 2. */
export function scoreParts(r: Rating): { price: number; home: number; in: number; total: number } {
  const price = r1(r.price)
  const home = r1(0.6 * r.way_home)
  const inn = r1(0.4 * r.way_in)
  return { price, home, in: inn, total: r1(price + home + inn) }
}

export interface PairRow {
  /** "CTG|GUA" */
  key: string
  in: string
  home: string
  /** the first option by the sort */
  best: FullOption
  cheapest: FullOption
  /** every option of the pair, by the sort */
  options: FullOption[]
  /** the ticket types it comes in, one ticket first */
  types: WayType[]
}

const TYPE_ORDER: WayType[] = ['ticket', 'madrid', 'oneways']

export function byOption(sort: PairSort) {
  return (a: FullOption, b: FullOption) =>
    sort === 'best'
      ? b.rating.total - a.rating.total || allIn(a) - allIn(b)
      : allIn(a) - allIn(b) || b.rating.total - a.rating.total
}

function passes(o: Option, wi: Way, wh: Way, f: PairFilters): boolean {
  if (f.arrival && o.entry !== f.arrival) return false
  if (f.departure && o.exit !== f.departure) return false
  if (f.noUS && (wi.us_transit || wh.us_transit)) return false
  if (f.maxHubNights != null && o.extras.hub_nights > f.maxHubNights) return false
  return true
}

/** The options that leave from home and come back to it, one row per pair of cities, ranked by the sort. */
export function pairRows(inout: InOut, home: string, f: PairFilters, sort: PairSort): PairRow[] {
  const groups = new Map<string, FullOption[]>()
  for (const o of inout.options as FullOption[]) {
    const wi = inout.ways[o.way_in]
    const wh = inout.ways[o.way_home]
    if (!wi || !wh || wi.from !== home || wh.to !== home) continue
    if (!passes(o, wi, wh, f)) continue
    const k = `${o.entry}|${o.exit}`
    groups.set(k, [...(groups.get(k) ?? []), o])
  }
  const order = byOption(sort)
  const rows: PairRow[] = [...groups.entries()].map(([key, list]) => {
    const options = [...list].sort(order)
    const cheapest = [...list].sort(byOption('cheapest'))[0]
    const types = TYPE_ORDER.filter((t) => list.some((o) => o.type === t))
    return { key, in: options[0].entry, home: options[0].exit, best: options[0], cheapest, options, types }
  })
  return rows.sort((a, b) => order(a.best, b.best) || a.key.localeCompare(b.key))
}

/** The row with the lowest all in price, wherever it ranks. */
export function cheapestKey(rows: PairRow[]): string | null {
  let at: PairRow | null = null
  for (const r of rows) if (!at || allIn(r.cheapest) < allIn(at.cheapest)) at = r
  return at?.key ?? null
}

export interface TypeTile { type: WayType; option: FullOption; price: number; delta: number }

/** The cheapest option of each ticket type, and how much more it is than the cheapest of them. */
export function typeTiles(options: FullOption[]): TypeTile[] {
  const tiles = TYPE_ORDER.flatMap((type) => {
    const list = options.filter((o) => o.type === type).sort(byOption('cheapest'))
    return list.length ? [{ type, option: list[0], price: allIn(list[0]), delta: 0 }] : []
  })
  const min = Math.min(...tiles.map((t) => t.price))
  return tiles.map((t) => ({ ...t, delta: t.price - min }))
}

export interface CityChoice { code: string; best: number; region: string }

/** Each city the rows fly in to or home from, with its best all in price, by region and then price. */
export function cityChoices(rows: PairRow[], side: 'in' | 'home', airports: Record<string, Pick<Airport, 'region'>>): CityChoice[] {
  const best = new Map<string, number>()
  for (const r of rows) {
    const c = side === 'in' ? r.in : r.home
    const p = allIn(r.cheapest)
    if (!best.has(c) || p < best.get(c)!) best.set(c, p)
  }
  const rank = (g: string) => { const i = REGION_ORDER.indexOf(g); return i < 0 ? REGION_ORDER.length : i }
  return [...best.entries()]
    .map(([code, p]) => ({ code, best: p, region: airports[code]?.region ?? 'other' }))
    .sort((a, b) => rank(a.region) - rank(b.region) || a.best - b.best || a.code.localeCompare(b.code))
}

/** Each home airport with the all in price of its cheapest pair, or null when the data has no fares from there. */
export function homeChoices(inout: InOut, homes: string[]): { code: string; best: number | null }[] {
  return homes.map((code) => {
    let best: number | null = null
    for (const o of inout.options) {
      const wi = inout.ways[o.way_in]
      const wh = inout.ways[o.way_home]
      if (!wi || !wh || wi.from !== code || wh.to !== code) continue
      const p = allIn(o)
      if (best == null || p < best) best = p
    }
    return { code, best }
  })
}

/** The separate one ways that can mix for a pair: in from home to the entry, home from the exit, by day. */
export function oneWaysFor(inout: InOut, home: string, entry: string, exit: string): { ins: Way[]; homes: Way[] } {
  const all = Object.values(inout.ways).filter((w) => w.type === 'oneways')
  const byDay = (a: Way, b: Way) => a.depart.localeCompare(b.depart) || a.price_dkk - b.price_dkk
  return {
    ins: all.filter((w) => w.direction === 'in' && w.from === home && w.to === entry).sort(byDay),
    homes: all.filter((w) => w.direction === 'home' && w.from === exit && w.to === home).sort(byDay),
  }
}

/** Two one ways put together, priced all in like the options of the build. */
export function mixOption(inout: InOut, wi: Way, wh: Way): FullOption {
  const o = mixWays(inout, wi, wh)
  return { ...o, total_dkk: o.price_dkk + (o.extras.cabin_bag_fees_dkk ?? 0) + (o.extras.hub_stay_estimate_dkk ?? 0) }
}

/** The tickets of a pair in travel order, a return once, each with the one link to look it up again. */
export function ticketsOf(inout: InOut, wi: Way, wh: Way): { ticket: Ticket; link: FlightLink | null }[] {
  const ids: string[] = []
  for (const w of [wi, wh]) for (const t of w.tickets) if (!ids.includes(t)) ids.push(t)
  return ids.flatMap((id) => {
    const ticket = inout.tickets[id]
    return ticket ? [{ ticket, link: ticketLink(inout, id, [wi, wh]) }] : []
  })
}
