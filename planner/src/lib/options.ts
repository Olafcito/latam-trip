import type { Extras, InOut, Option, Rating, Ticket, Way, WayType } from '../data/types'

/** Unique tickets of the ways in travel order; a shared return/open-jaw ticket counts once. */
export function uniqueTickets(data: InOut, ways: Way[]): Ticket[] {
  const ids: string[] = []
  for (const w of ways) for (const t of w.tickets) if (!ids.includes(t)) ids.push(t)
  return ids.map((id) => data.tickets[id]).filter((t): t is Ticket => !!t)
}

/** Flight price and bag fees of a set of ways, from their tickets (each ticket once). */
export function priceOfWays(data: InOut, ways: Way[]): { price_dkk: number; cabin: number | null; checked: number | null } {
  const tickets = uniqueTickets(data, ways)
  let price = 0
  let cabin: number | null = 0
  let checked: number | null = 0
  for (const t of tickets) {
    price += t.price_dkk
    cabin = cabin == null || t.cabin_bag_fee_dkk == null ? null : cabin + t.cabin_bag_fee_dkk
    checked = checked == null || t.checked_bag_fee_dkk == null ? null : checked + t.checked_bag_fee_dkk
  }
  return { price_dkk: price, cabin, checked }
}

/** Price score: 5 at the anchor for tickets + cabin-bag fees, minus 1 per 1,000 kr more, lowest 1. */
export function priceScore(ticketsPlusCabin: number, anchor = 7000): number {
  return Math.max(1, Math.min(5, 5 - (ticketsPlusCabin - anchor) / 1000))
}

/** Total out of 10 = 2 x (0.5 price + 0.3 way home + 0.2 way in), one decimal. */
export function totalRating(price: number, wayIn: number, wayHome: number): number {
  return Math.round(20 * (0.5 * price + 0.3 * wayHome + 0.2 * wayIn)) / 10
}

/**
 * Combine any way in with any way home. Only separate one-ways can be mixed freely:
 * a `ticket` or `madrid` way always travels with its paired_with way.
 */
export function mixWays(data: InOut, wayIn: Way, wayHome: Way): Option {
  if (wayIn.direction !== 'in' || wayHome.direction !== 'home') throw new Error('mixWays needs a way in and a way home')
  for (const w of [wayIn, wayHome]) {
    if (w.type !== 'oneways') {
      const pair = w.direction === 'in' ? wayHome : wayIn
      if (w.paired_with !== pair.id) throw new Error(`${w.id} is a ${w.type} way and only goes with ${w.paired_with}`)
    }
  }
  const p = priceOfWays(data, [wayIn, wayHome])
  const anchor = data.rating?.price_anchor_dkk ?? 7000
  const ps = Math.round(priceScore(p.price_dkk + (p.cabin ?? 0), anchor) * 10) / 10
  const rating: Rating = {
    total: totalRating(priceScore(p.price_dkk + (p.cabin ?? 0), anchor), wayIn.score, wayHome.score),
    price: ps,
    way_in: wayIn.score,
    way_home: wayHome.score,
  }
  const extras: Extras = {
    cabin_bag_fees_dkk: p.cabin,
    checked_bag_fees_dkk: p.checked,
    hub_nights: wayIn.hub_nights + wayHome.hub_nights,
    hub_stay_estimate_dkk: sumNullable(wayIn.extras.hub_stay_estimate_dkk, wayHome.extras.hub_stay_estimate_dkk),
  }
  const type: WayType = wayIn.type === 'oneways' && wayHome.type === 'oneways' ? 'oneways' : wayIn.type
  return {
    id: `${wayIn.to}-${wayHome.from}-mix-${wayIn.id}-${wayHome.id}`,
    type,
    entry: wayIn.to,
    exit: wayHome.from,
    way_in: wayIn.id,
    way_home: wayHome.id,
    shared_ticket: wayIn.shared_ticket && wayIn.shared_ticket === wayHome.shared_ticket ? wayIn.shared_ticket : null,
    price_dkk: p.price_dkk,
    extras,
    rating,
  }
}

export function sumNullable(a: number | null | undefined, b: number | null | undefined): number | null {
  return a == null || b == null ? null : a + b
}

export function oneWayWays(data: InOut, direction: 'in' | 'home'): Way[] {
  return Object.values(data.ways)
    .filter((w) => w.type === 'oneways' && w.direction === direction)
    .sort((a, b) => b.score - a.score || a.price_dkk - b.price_dkk)
}

// ---- filters for the start table

export interface Filters {
  arrival: string // '' = any
  departure: string
  type: '' | WayType
  maxPrice: number | null
  minRating: number | null
  maxHours: number | null // flying hours per direction
  noUS: boolean
  maxHubNights: number | null
}

export const DEFAULT_FILTERS: Filters = {
  arrival: '',
  departure: '',
  type: '',
  maxPrice: null,
  minRating: null,
  maxHours: null,
  noUS: false,
  maxHubNights: null,
}

export function passesFilters(o: Option, wayIn: Way, wayHome: Way, f: Filters): boolean {
  if (f.arrival && o.entry !== f.arrival) return false
  if (f.departure && o.exit !== f.departure) return false
  if (f.type && o.type !== f.type) return false
  if (f.maxPrice != null && o.price_dkk > f.maxPrice) return false
  if (f.minRating != null && o.rating.total < f.minRating) return false
  if (f.maxHours != null && (wayIn.flying_hours > f.maxHours || wayHome.flying_hours > f.maxHours)) return false
  if (f.noUS && (wayIn.us_transit || wayHome.us_transit)) return false
  if (f.maxHubNights != null && o.extras.hub_nights > f.maxHubNights) return false
  return true
}
