// The pairs of the way picker: every way in and way home that leave from one home, one row per pair of
// cities, ranked by the project's score or by the all in price, with what each pair loses points for.
import type { Airport, Booking, InOut, Option, Rating, Ticket, Way, WayType } from '../data/types'
import { wayHeld, type BookData } from './booked'
import type { Journey } from './journey'
import { mixWays, type Filters } from './options'
import { ticketLink, type FlightLink } from './links'
import { topTiers, type Tier } from './tiers'

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

export interface TypeTile { type: WayType; option: FullOption; price: number; delta: number }

/** How much more the pair's cheapest all in is than the other pair's, in kroner. Negative when it is less. */
export function cheapestDelta(row: PairRow, against: PairRow): number {
  return allIn(row.cheapest) - allIn(against.cheapest)
}

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

export interface MatrixCell {
  row: PairRow
  /** what the cell says: the score on the best sort, the all in price on the cheapest */
  value: number
  /** 1 for the best 10 by the sort, 2 for the next 20, 0 for the rest */
  tier: Tier
}

export interface PairMatrix {
  /** the cities flown in to, the rows, by region and then by name */
  ins: { region: string; codes: string[] }[]
  /** the cities flown home from, the columns, by region and then by name */
  homes: { region: string; codes: string[] }[]
  /** the pairs that pass every filter, by key. A pair of the grid missing here is an empty cell */
  cells: Map<string, MatrixCell>
}

/**
 * The pairs as a grid: the cities of `frame` as rows and columns, grouped by region, and a cell for each
 * pair of `rows`, holding the figure the sort is on and its tier.
 */
export function pairMatrix(frame: PairRow[], rows: PairRow[], airports: Record<string, Pick<Airport, 'name' | 'region'>>, sort: PairSort): PairMatrix {
  const group = (codes: string[]) => {
    const byRegion = new Map<string, string[]>()
    for (const c of codes) {
      const g = airports[c]?.region ?? 'other'
      byRegion.set(g, [...(byRegion.get(g) ?? []), c])
    }
    const name = (c: string) => airports[c]?.name ?? c
    return [...REGION_ORDER, ...[...byRegion.keys()].filter((g) => !REGION_ORDER.includes(g)).sort()]
      .filter((g) => byRegion.has(g))
      .map((g) => ({ region: g, codes: byRegion.get(g)!.sort((a, b) => name(a).localeCompare(name(b))) }))
  }
  const ins = group([...new Set([...frame, ...rows].map((r) => r.in))])
  const homes = group([...new Set([...frame, ...rows].map((r) => r.home))])
  const values = rows.map((r) => (sort === 'best' ? scoreParts(r.best.rating).total : allIn(r.cheapest)))
  const tiers = topTiers(values, sort === 'best' ? 'desc' : 'asc')
  const cells = new Map(rows.map((row, i) => [row.key, { row, value: values[i], tier: tiers[i] }]))
  return { ins, homes, cells }
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

export interface Picked {
  /** the option as it stands, a mix of two one ways when the ways were swapped */
  option: FullOption
  /** the option of the pair the pick started from */
  base: FullOption
  wi: Way
  wh: Way
}

/**
 * What the pair shows as picked: the option chosen, else the trip's own option, else the first by the sort.
 * On two one ways the way in and the way home can be swapped for other one ways of the same cities. With no
 * choice made, a trip on mixed one ways of this pair shows its own two ways.
 */
export function pickedOf(
  inout: InOut, row: PairRow,
  s: { chosen: string | null; tripIn?: string; tripHome?: string; mixIn: string | null; mixHome: string | null },
): Picked {
  const own = row.options.find((o) => o.way_in === s.tripIn && o.way_home === s.tripHome)
  const fits = (id: string | null | undefined, dir: 'in' | 'home', like: Way): Way | null => {
    const w = id ? inout.ways[id] : undefined
    if (!w || w.type !== 'oneways' || w.direction !== dir) return null
    return w.from === like.from && w.to === like.to ? w : null
  }
  const tripMix = !s.chosen && !own ? fits(s.tripIn, 'in', inout.ways[row.cheapest.way_in]) && fits(s.tripHome, 'home', inout.ways[row.cheapest.way_home]) : null
  const base = row.options.find((o) => o.id === s.chosen) ?? own ?? (tripMix ? row.options.filter((o) => o.type === 'oneways').sort(byOption('cheapest'))[0] : undefined) ?? row.best
  const bi = inout.ways[base.way_in]
  const bh = inout.ways[base.way_home]
  if (base.type !== 'oneways') return { option: base, base, wi: bi, wh: bh }
  const wi = fits(s.mixIn, 'in', bi) ?? (tripMix ? fits(s.tripIn, 'in', bi) : null) ?? bi
  const wh = fits(s.mixHome, 'home', bh) ?? (tripMix ? fits(s.tripHome, 'home', bh) : null) ?? bh
  if (wi.id === bi.id && wh.id === bh.id) return { option: base, base, wi, wh }
  const known = row.options.find((o) => o.way_in === wi.id && o.way_home === wh.id)
  return { option: known ?? mixOption(inout, wi, wh), base, wi, wh }
}

/** The option a pick goes on as: the id of an option of the pair, or null for a mix of one ways the data does not hold. */
export function pickOptionId(row: PairRow, picked: Picked): string | null {
  return row.options.some((o) => o.id === picked.option.id) ? picked.option.id : null
}

export type FlagTone = 'warn' | 'good' | 'plain'

const FLAGS: Record<string, [string, FlagTone]> = {
  us_transit: ['Through the US', 'warn'],
  basic_fare: ['Basic fare', 'warn'],
  basic_economy: ['Basic economy', 'warn'],
  no_link: ['No saved page', 'plain'],
  long_layover: ['Long layover', 'warn'],
  overnight_layover: ['Overnight layover', 'warn'],
  tight_connection: ['Tight connection', 'warn'],
  self_transfer: ['Self transfer', 'warn'],
  airport_change: ['Airport change', 'warn'],
  multi_ticket: ['Several tickets', 'plain'],
  over_acceptable: ['Over the limit', 'warn'],
  price_unverified: ['Price not checked', 'warn'],
  price_verified_booking: ['Price checked at booking', 'good'],
  date_assumed: ['Date assumed', 'warn'],
  date_shifted_out: ['Out day moved', 'plain'],
  date_shifted_home: ['Home day moved', 'plain'],
  home_2feb: ['Home 2 Feb', 'plain'],
  best_value: ['Best value', 'good'],
  fastest: ['Fastest', 'good'],
  kiwi_discovery: ['Found on Kiwi', 'plain'],
  mix_match: ['Mixed match', 'plain'],
  alt_home_listing: ['Listed from another home', 'plain'],
  picked_detail: ['Detail page read', 'good'],
}

/** A ticket flag as the words on its chip and its tone. A flag the build adds later reads as its own words. */
export function flagChip(flag: string): { label: string; tone: FlagTone } {
  const f = FLAGS[flag]
  if (f) return { label: f[0], tone: f[1] }
  const words = flag.replace(/_/g, ' ').trim()
  return { label: words.charAt(0).toUpperCase() + words.slice(1), tone: 'plain' }
}

/**
 * The sides of the trip whose booked way a pick of wi and wh would replace. A side being unlocked is not held,
 * and no journey holds nothing.
 */
export function heldSides(bookings: Booking[], data: BookData, journey: Journey | null, wi: Way, wh: Way, unlocked: 'in' | 'home' | number | null): { in: boolean; home: boolean } {
  if (!journey) return { in: false, home: false }
  const ways = data.inout.ways
  return {
    in: wayHeld(bookings, data, ways[journey.wayIn], wi, unlocked === 'in'),
    home: wayHeld(bookings, data, ways[journey.wayHome], wh, unlocked === 'home'),
  }
}
