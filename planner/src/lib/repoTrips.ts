import type { InOut, Ticket, Way } from '../data/types'
import { journeyIsValid, type Hop, type Journey, type Place } from './journey'

// The trips table of the repo (data/web/trips.json, written by tripdb save-trip) as planner journeys.
// A trip brings its own way in and way home. They are kept under the trip's own ids, since way ids in
// inout.json change with every build and the trip's copy of its ways does not.

export const tripWayId = (tripId: string, dir: 'in' | 'home') => `${tripId}:${dir}`

/** An earlier version of a trip, as trips.json lists it. */
export interface TripVersion {
  version: number
  saved_at: string
  by?: string
  why?: string
}

export interface RowPlace {
  node: string
  hop: (Hop & { observed_at?: string | null }) | null
  why?: string | null
  nights?: number | null
}

/** One trip of trips.json: the latest version of a row of data/sources/trips.jsonl. */
export interface TripRow {
  id: string
  version: number
  name: string
  saved_at: string
  by: string
  why: string
  rank?: number | null
  option_id?: string | null
  way_in: Partial<Way> & { from: string; to: string; timeline: Way['timeline'] }
  way_home: Partial<Way> & { from: string; to: string; timeline: Way['timeline'] }
  tickets?: Record<string, Partial<Ticket> & { id: string; price_dkk: number }> | null
  places: RowPlace[]
  history?: TripVersion[]
}

function isRow(x: unknown): x is TripRow {
  const r = x as TripRow
  const way = (w: unknown) => !!w && typeof w === 'object' && Array.isArray((w as Way).timeline)
  return !!r && typeof r.id === 'string' && typeof r.name === 'string' && Array.isArray(r.places) && r.places.length > 0 &&
    r.places.every((p) => !!p && typeof p.node === 'string') && way(r.way_in) && way(r.way_home)
}

/** The trips of a trips.json file. Anything that is not a trip is left out. */
export function parseTripsFile(raw: unknown): TripRow[] {
  const trips = (raw as { trips?: unknown } | null)?.trips
  return Array.isArray(trips) ? trips.filter(isRow) : []
}

function asWay(w: TripRow['way_in'], id: string, direction: 'in' | 'home'): Way {
  return {
    type: 'ticket',
    depart: '',
    arrive: '',
    total_hours: 0,
    flying_hours: 0,
    flights: w.timeline.filter((t) => t.kind === 'flight').length,
    hub_nights: 0,
    changes: 0,
    us_transit: false,
    airports: [],
    tickets: [],
    shared_ticket: null,
    price_dkk: 0,
    score: 0,
    ...w,
    extras: { hub_nights: w.hub_nights ?? 0, hub_stay_estimate_dkk: null, cabin_bag_fees_dkk: null, checked_bag_fees_dkk: null, ...w.extras },
    id,
    direction,
  }
}

/** inout with every trip's way in and way home added, and any ticket of theirs the build lacks. */
export function withTripWays(inout: InOut, rows: readonly TripRow[]): InOut {
  const ways = { ...inout.ways }
  const tickets = { ...inout.tickets }
  for (const r of rows) {
    for (const dir of ['in', 'home'] as const) {
      const w = asWay(dir === 'in' ? r.way_in : r.way_home, tripWayId(r.id, dir), dir)
      ways[w.id] = w
      w.tickets.forEach((t, k) => {
        if (tickets[t]) return
        const own = r.tickets?.[t]
        tickets[t] = {
          quote_id: t.replace(/^T/, ''), source: 'trips.json', structure: 'one_way', legs: [],
          fare_brand: null, cabin_bag: null, checked_bag: null, cabin_bag_fee_dkk: null, checked_bag_fee_dkk: null,
          tickets_inside: 1, self_transfer: false, carriers: [], flags: [], notes: null, link: null,
          ...own,
          id: t,
          // a ticket the trip does not describe carries the way's price on its first ticket
          price_dkk: own?.price_dkk ?? (k === 0 ? w.price_dkk : 0),
          observed_at: own?.observed_at ?? '',
        }
      })
    }
  }
  return { ...inout, ways, tickets }
}

/** A trip of the table as a journey the planner opens, lists and edits. */
export function rowToJourney(r: TripRow): Journey {
  const places: Place[] = r.places.map((p, i) => {
    const place: Place = { node: p.node, hop: i === 0 ? null : (p.hop ?? null) }
    if (p.why) place.why = p.why
    return place
  })
  const j: Journey = {
    id: r.id,
    name: r.name,
    wayIn: tripWayId(r.id, 'in'),
    wayHome: tripWayId(r.id, 'home'),
    optionId: null,
    places,
    savedAt: r.saved_at,
    version: r.version,
  }
  if (r.rank != null) j.rank = r.rank
  if (r.why) j.why = r.why
  return j
}

/** Two journeys with the same content, whenever they were saved. */
export function sameJourney(a: Journey, b: Journey): boolean {
  return JSON.stringify({ ...a, savedAt: 0 }) === JSON.stringify({ ...b, savedAt: 0 })
}

/** The trips list: the browser's own trips, then every table trip it has no copy of and has not hidden. */
export function mergeTrips(local: readonly Journey[], repo: readonly Journey[], hidden: Readonly<Record<string, number>> = {}): Journey[] {
  const have = new Set(local.map((j) => j.id))
  return [...local, ...repo.filter((r) => !have.has(r.id) && !((hidden[r.id] ?? 0) >= (r.version ?? 1)))]
}

/** What the browser keeps of the list: every trip except a table trip it never changed. */
export function localOnly(saved: readonly Journey[], repo: readonly Journey[]): Journey[] {
  const byId = new Map(repo.map((r) => [r.id, r]))
  return saved.filter((j) => {
    const r = byId.get(j.id)
    return !r || !sameJourney(r, j)
  })
}

/** The shape of a route: its places, how each was reached, the flights picked. */
function shape(j: Journey): string {
  return JSON.stringify([j.name, j.places.map((p) => [p.node, p.hop?.mode ?? null, p.hop?.flight?.quote_id ?? null])])
}

/**
 * Trips this browser was given by the old seed import, read against the table. A copy the user never
 * changed is dropped so the table trip shows. A seeded trip the user deleted stays hidden.
 */
export function retireSeeds(local: readonly Journey[], repo: readonly Journey[], seeded: readonly string[]): { local: Journey[]; hidden: Record<string, number> } {
  const byId = new Map(repo.map((r) => [r.id, r]))
  const kept = local.filter((j) => {
    const r = byId.get(j.id)
    return !(r && seeded.includes(j.id) && shape(r) === shape(j))
  })
  const hidden: Record<string, number> = {}
  const have = new Set(local.map((j) => j.id))
  for (const id of seeded) {
    const r = byId.get(id)
    if (r && !have.has(id)) hidden[id] = r.version ?? 1
  }
  return { local: kept, hidden }
}

// ---- deep link: /?trip=<id> ----

export function tripParam(search: string): string | null {
  const id = new URLSearchParams(search).get('trip')
  return id && id.trim() ? id.trim() : null
}

export type DeepLink = { kind: 'open'; journey: Journey } | { kind: 'unknown'; id: string } | null

/** What /?trip=<id> asks for: the trip to open, an id no trip has, or nothing. */
export function resolveDeepLink(search: string, trips: readonly Journey[], current: Journey | null = null): DeepLink {
  const id = tripParam(search)
  if (!id) return null
  if (current?.id === id && journeyIsValid(current)) return { kind: 'open', journey: current }
  const j = trips.find((t) => t.id === id)
  return j ? { kind: 'open', journey: j } : { kind: 'unknown', id }
}

/** The page address with ?trip=<id> set, or taken away when id is null. Other parameters stay. */
export function urlWithTrip(href: string, id: string | null): string {
  const u = new URL(href)
  if (id) u.searchParams.set('trip', id)
  else u.searchParams.delete('trip')
  return u.pathname + u.search + u.hash
}
