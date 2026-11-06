import type { Lodging, LodgingKind, LodgingPrice, LodgingRoom, LodgingTag } from '../data/types'
import { dayDiff, day } from './format'
import { SITE } from './lodgingWords'
import { datedLink } from './lodgingLinks'
import { sellerLogo } from './purchase'

// What the accommodation panes show of a place to stay for the dates searched: a price per night for each room,
// for the place and for each site that sells it, the cheapest of the sites, what the place offers and the
// rooms it has. Every figure comes from a stored price. A price for other dates says so, and a site with no
// price shows none.

/** A price per night: exact when it is for the very dates searched, else the nearest one seen, with its own dates. */
export type Nightly = { dkk: number; exact: true } | { dkk: number; exact: false; check_in: string; check_out: string }

const nightsOf = (p: Pick<LodgingPrice, 'check_in' | 'check_out'>) => Math.max(1, dayDiff(p.check_in, p.check_out))

/** The price per night of a row, from its own figure or its total over its nights. null with neither. */
function perNight(p: LodgingPrice): number | null {
  if (p.per_night_dkk != null) return p.per_night_dkk
  return p.total_dkk == null ? null : p.total_dkk / nightsOf(p)
}

/**
 * The price per night from a list of prices for the dates: the cheapest of those for these very dates, else the one
 * whose dates are nearest, the latest seen when two are as near, then the cheapest. null with no price.
 */
export function nightly(prices: readonly LodgingPrice[], checkIn: string, checkOut: string): Nightly | null {
  const rows = prices.flatMap((p) => {
    const n = perNight(p)
    return n == null ? [] : [{ p, n }]
  })
  if (!rows.length) return null
  const same = rows.filter((x) => x.p.check_in === checkIn && x.p.check_out === checkOut).sort((a, b) => a.n - b.n)[0]
  if (same) return { dkk: Math.round(same.n), exact: true }
  const away = (x: (typeof rows)[number]) => Math.abs(dayDiff(checkIn, x.p.check_in)) + Math.abs(dayDiff(checkOut, x.p.check_out))
  const near = [...rows].sort((a, b) => away(a) - away(b) || (a.p.observed_at < b.p.observed_at ? 1 : a.p.observed_at > b.p.observed_at ? -1 : 0) || a.n - b.n)[0]
  return { dkk: Math.round(near.n), exact: false, check_in: near.p.check_in, check_out: near.p.check_out }
}

/** An exact price beats one for other dates, then the lower one wins. */
const better = (a: Nightly | null, b: Nightly | null): Nightly | null => {
  if (!a) return b
  if (!b) return a
  if (a.exact !== b.exact) return a.exact ? a : b
  return b.dkk < a.dkk ? b : a
}

/** The room of a place that is cheapest per night for the dates, and its price. Null with no price at all. */
export function cheapestRoom(l: Lodging, checkIn: string, checkOut: string): { room: LodgingRoom; price: Nightly } | null {
  let best: { room: LodgingRoom; price: Nightly } | null = null
  for (const room of l.rooms) {
    const price = nightly(room.prices, checkIn, checkOut)
    if (price && (!best || better(best.price, price) === price)) best = { room, price }
  }
  return best
}

/** The words for a price for other dates: what it is and the dates it is for. */
export function otherDates(p: Extract<Nightly, { exact: false }>): string {
  return `The price per night for ${day(p.check_in)} to ${day(p.check_out)}, not these dates`
}

// ---- the sites that sell a place

/** Hosts that are not one of the site kinds, by their own name. */
const HOST_NAME: Record<string, string> = {
  'agoda.com': 'Agoda', 'expedia.com': 'Expedia', 'expedia.dk': 'Expedia', 'hotels.com': 'Hotels.com', 'trip.com': 'Trip.com',
  'airbnb.com': 'Airbnb', 'tripadvisor.com': 'Tripadvisor', 'trivago.com': 'Trivago', 'google.com': 'Google',
}

const hostOf = (url: string | null | undefined) => {
  try {
    return url ? new URL(url).hostname.toLowerCase().replace(/^www\./, '') : ''
  } catch {
    return ''
  }
}

/** The key and the name of a site: its kind, or for any other its host and the name the host goes by. */
export function siteKey(site: Lodging['links'][number]['site'] | null, url: string | null | undefined): { key: string; name: string } {
  if (site && site !== 'other' && site !== 'own') return { key: site, name: SITE[site] }
  const h = hostOf(url)
  if (!h) return { key: site ?? 'other', name: site === 'own' ? SITE.own : SITE.other }
  const known = Object.entries(HOST_NAME).find(([d]) => h === d || h.endsWith(`.${d}`))
  if (known) return { key: known[0], name: known[1] }
  return site === 'own' ? { key: 'own', name: SITE.own } : { key: h, name: h }
}

export interface Provider {
  key: string
  name: string
  url: string | null
  logo: string | null
  /** the room's price per night on this site, null when the site has none */
  price: Nightly | null
  /** the lowest exact price of two or more sites */
  cheapest: boolean
}

/**
 * The sites that sell the room, one row each: the place's links and the sites its prices are from. Each with the
 * room's price per night there for the dates, the cheapest exact one marked when there are two or more to compare.
 * Sites with a price come first, cheapest first, then the ones without.
 */
export function providers(l: Lodging, room: LodgingRoom | null, checkIn: string, checkOut: string): Provider[] {
  const rows = new Map<string, Omit<Provider, 'price' | 'cheapest'> & { prices: LodgingPrice[] }>()
  const take = (site: Lodging['links'][number]['site'] | null, url: string | null) => {
    const { key, name } = siteKey(site, url)
    const row = rows.get(key) ?? { key, name, url: null, logo: sellerLogo(name), prices: [] }
    row.url ??= url && /^https:\/\//i.test(url) ? url : null
    rows.set(key, row)
    return row
  }
  for (const link of l.links) take(link.site, link.url)
  for (const p of room?.prices ?? []) if (p.site) take(p.site, p.url).prices.push(p)
  return ranked([...rows.values()].map(({ prices, ...r }) => ({ ...r, url: datedLink(r.url, checkIn, checkOut), price: nightly(prices, checkIn, checkOut), cheapest: false })))
}

/** The rows marked and ordered: the cheapest exact one of two or more marked, priced first, cheapest first. */
function ranked(rows: Provider[]): Provider[] {
  const out = rows.map((r) => ({ ...r, cheapest: false }))
  const exact = out.filter((r) => r.price?.exact)
  if (exact.length > 1) {
    const low = Math.min(...exact.map((r) => r.price!.dkk))
    const first = exact.find((r) => r.price!.dkk === low)
    if (first && exact.some((r) => r.price!.dkk > low)) first.cheapest = true
  }
  const rank = (r: Provider) => (r.price ? (r.price.exact ? 0 : 1) : 2)
  return out.sort((a, b) => rank(a) - rank(b) || (a.price?.dkk ?? 0) - (b.price?.dkk ?? 0))
}

/**
 * The sites a place is booked at in the app: Hostelworld, and Booking.com only when the place has its own Booking.com
 * link. The cheapest is marked among these two alone.
 */
export function bookAt(l: Lodging, room: LodgingRoom | null, checkIn: string, checkOut: string): Provider[] {
  const linked = l.links.some((k) => k.site === 'booking')
  return ranked(providers(l, room, checkIn, checkOut).filter((r) => r.key === 'hostelworld' || (r.key === 'booking' && linked)))
}

// ---- what a place offers

export type Amenity = { key: 'rooms' | LodgingTag; label: string }

/** The rooms as one fact: dorms, private rooms or both. null when the rooms do not say. */
export function roomMix(rooms: readonly LodgingRoom[]): string | null {
  const shared = rooms.some((r) => r.private === false)
  const own = rooms.some((r) => r.private === true)
  if (shared && own) return 'Dorms & private rooms'
  if (shared) return 'Dorms'
  if (own) return 'Private rooms'
  return null
}

/** Each tag in one word, as it stands under its icon. Social reads as the bar and a workspace as the Wi-Fi it needs. */
export const AMENITY_WORD: Record<LodgingTag, string> = {
  pool: 'Pool', social: 'Bar', workspace: 'Wi-Fi', aircon: 'AC', breakfast: 'Breakfast', kitchen: 'Kitchen', beach: 'Beach', quiet: 'Quiet',
}

/** What a place offers, the rooms first and then its tags, each tag in one word. */
export function amenities(l: Pick<Lodging, 'rooms' | 'tags'>): Amenity[] {
  const mix = roomMix(l.rooms)
  const tags = tagWords(l.tags)
  return mix ? [{ key: 'rooms', label: mix }, ...tags] : tags
}

const tagWords = (have: readonly LodgingTag[]): Amenity[] =>
  (Object.keys(AMENITY_WORD) as LodgingTag[]).filter((t) => have.includes(t)).map((t) => ({ key: t, label: AMENITY_WORD[t] }))

/** What a place offers as one row of icons with one word each: the tags, then Dorms or Private for the rooms. */
export function amenityRow(l: Pick<Lodging, 'rooms' | 'tags'>): Amenity[] {
  const shared = l.rooms.some((r) => r.private === false)
  const own = l.rooms.some((r) => r.private === true)
  const rooms: Amenity[] = shared ? [{ key: 'rooms', label: 'Dorms' }] : own ? [{ key: 'rooms', label: 'Private' }] : []
  return [...tagWords(l.tags), ...rooms]
}

// ---- the search list

export type StaySort = 'recommended' | 'price' | 'rating'

/** The places of the kind, in the order asked. Recommended keeps the order given. A place with no price goes last on price. */
export function sortPlaces(list: readonly Lodging[], kind: LodgingKind | 'all', sort: StaySort, checkIn: string, checkOut: string): Lodging[] {
  const shown = list.filter((l) => kind === 'all' || l.kind === kind)
  if (sort === 'recommended') return shown
  if (sort === 'rating') return [...shown].sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1))
  const price = new Map(shown.map((l) => [l.id, cheapestRoom(l, checkIn, checkOut)?.price.dkk ?? Infinity]))
  return [...shown].sort((a, b) => price.get(a.id)! - price.get(b.id)!)
}

/** "1 night", "3 nights". */
export const nightsWord = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

/** "8 Dec to 9 Dec": both days in full, as the stay rows write them. */
export const stayDates = (checkIn: string, checkOut: string) => `${day(checkIn)} to ${day(checkOut)}`
