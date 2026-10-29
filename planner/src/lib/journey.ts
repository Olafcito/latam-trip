import type { AppData, CrawledFlight, InOut, MapData, Mode, StopItem, Way } from '../data/types'
import { day, dayDiff, dayTime } from './format'
import { edgeHours, edgePrice, type Arc } from './graph'
import { priceOfWays } from './options'
import { addDays } from './time'

export interface Hop {
  from: string
  to: string
  mode: Mode
  operator: string | null
  hours: number | null
  price_dkk: number | null
  overnight: boolean
  border: boolean
  /** a picked crawled flight; its price was seen for its own date */
  flight: CrawledFlight | null
  /** an overland block of a planned trip: your own route, drawn as one dashed line; the note says how */
  overland?: string
  /** the countries an overland block passes through, in order, ends included */
  countries?: string[]
  /** when the hop's price was seen (a trip from the trips table) */
  observed_at?: string | null
  /** the day you set out on this leg, "2026-12-13", when you have set one */
  date?: string
}

export interface Place {
  node: string
  /** how we got here from the previous place; null for the first place */
  hop: Hop | null
  /** why the stop is in the trip (a trip from the trips table) */
  why?: string
}

export interface Journey {
  id: string
  name: string
  wayIn: string
  wayHome: string
  optionId: string | null
  places: Place[]
  savedAt?: string
  /** a ranked trip from the trips table (data/web/trips.json) */
  rank?: number
  /** the version of the table trip this journey is, or was edited from */
  version?: number
  /** why the trip looks the way it does (a trip from the trips table) */
  why?: string
}

export function nodeForAirport(inout: InOut, code: string): string {
  return inout.airports[code]?.map_node ?? code
}

export function newJourney(inout: InOut, wayIn: Way, wayHome: Way, optionId: string | null): Journey {
  return {
    id: `j${Date.now().toString(36)}`,
    name: `${inout.airports[wayIn.to]?.name ?? wayIn.to} in, ${inout.airports[wayHome.from]?.name ?? wayHome.from} home`,
    wayIn: wayIn.id,
    wayHome: wayHome.id,
    optionId,
    places: [{ node: nodeForAirport(inout, wayIn.to), hop: null }],
  }
}

export function hopFromArc(from: string, arc: Arc, flight: CrawledFlight | null): Hop {
  const e = arc.edge
  return {
    from,
    to: arc.to,
    mode: e.mode,
    operator: e.operator ?? (e.carriers?.join(', ') || null),
    hours: flight ? flight.hours : edgeHours(e),
    price_dkk: flight ? flight.price_dkk : edgePrice(e),
    overnight: !!e.overnight,
    border: !!e.border,
    flight,
  }
}

// ---- dates

export interface ScheduledPlace {
  node: string
  /** when you get here, known only where a dated leg (or the landing) brings you */
  arrive: string | null
  /** when you leave, known only where a dated leg takes you on */
  depart: string | null
  /** the days between the dated moments around this place, shared evenly with its neighbours */
  days: number
  /** the day you get here and the day you leave, "2026-12-13", estimated when not exact */
  inDay: string
  outDay: string
  /** true when both ends are dated, so the days are not a share */
  exact: boolean
}

export interface Warning {
  level: 'error' | 'warn'
  text: string
}

export interface Schedule {
  places: ScheduledPlace[]
  firstDay: string
  homeDepart: string
  /** calendar days from the landing to the flight home */
  totalDays: number
  warnings: Warning[]
}

/** a before b. A date alone ("2026-12-13") is only before a later day, never before a time on its own day. */
const before = (a: string, b: string) => (a.length === 10 || b.length === 10 ? a.slice(0, 10) < b.slice(0, 10) : a < b)

/** When a hop leaves and arrives, if it is dated: a date set on it, else its picked flight. */
function dated(h: Hop): { depart: string; arrive: string } | null {
  const f = h.flight
  if (h.date) {
    if (f && f.depart.slice(0, 10) === h.date) return { depart: f.depart, arrive: f.arrive }
    return { depart: h.date, arrive: h.overnight ? addDays(h.date, 1) : h.date }
  }
  return f ? { depart: f.depart, arrive: f.arrive } : null
}

/** The day a hop leaves: the day set on it, else its picked flight's, else the estimate passed in. */
export function legDay(h: Hop, estimate: string): string {
  return h.date ?? h.flight?.depart.slice(0, 10) ?? estimate
}

/**
 * The dated moments of a trip are its landing, the legs with a date set or a picked flight, and
 * its flight home. The days between two dated moments are shared evenly by the places in between.
 */
export function schedule(j: Journey, wayIn: Way, wayHome: Way, exitNode: string, names: (n: string) => string): Schedule {
  const warnings: Warning[] = []
  const first = wayIn.arrive.slice(0, 10)
  const places: ScheduledPlace[] = j.places.map((p) => ({ node: p.node, arrive: null, depart: null, days: 0, inDay: first, outDay: first, exact: false }))
  if (places[0]) places[0].arrive = wayIn.arrive
  let since = wayIn.arrive
  let start = 0
  const share = (end: number, until: string) => {
    const n = end - start + 1
    const days = dayDiff(since, until)
    if (before(until, since)) {
      const where = start === end ? 'there' : `to ${names(places[start].node)}`
      warnings.push({ level: 'error', text: `The leg on from ${names(places[end].node)} leaves ${until.length === 10 ? day(until) : dayTime(until)}, before you get ${where} ${dayTime(since)}` })
    }
    let at = since.slice(0, 10)
    for (let k = start; k <= end; k++) {
      places[k].days = Math.max(0, Math.floor(days / n) + (k === start ? days % n : 0))
      places[k].inDay = at
      at = addDays(at, places[k].days)
      places[k].outDay = at
      places[k].exact = n === 1
    }
  }
  j.places.forEach((p, i) => {
    const t = i > 0 && p.hop ? dated(p.hop) : null
    if (!t || !p.hop) return
    const f = p.hop.flight
    if (p.hop.date && f && f.depart.slice(0, 10) !== p.hop.date) {
      warnings.push({ level: 'warn', text: `The flight to ${names(p.node)} you picked leaves ${day(f.depart)}, not ${day(p.hop.date)}, so its price is for another day` })
    }
    places[i - 1].depart = t.depart
    places[i].arrive = t.arrive
    share(i - 1, t.depart)
    if (before(wayHome.depart, t.arrive)) {
      const by = f && t.depart === f.depart ? `The flight to ${names(p.node)} lands` : `The leg to ${names(p.node)} gets there`
      warnings.push({ level: 'error', text: `${by} after the flight home leaves` })
    }
    since = t.arrive
    start = i
  })
  if (places.length) {
    places[places.length - 1].depart = wayHome.depart
    share(places.length - 1, wayHome.depart)
  }
  const last = places[places.length - 1]
  if (last && last.node !== exitNode) warnings.push({ level: 'warn', text: `The journey has to end in ${names(exitNode)}, where the way home leaves` })
  return { places, firstDay: first, homeDepart: wayHome.depart, totalDays: dayDiff(wayIn.arrive, wayHome.depart), warnings }
}

// ---- totals

export interface Totals {
  tickets_dkk: number
  regional_flights_dkk: number
  cabin_bag_dkk: number | null
  checked_bag_dkk: number | null
  hub_nights: number
  hub_stay_dkk: number | null
  ground_dkk: number
  ground_unknown: number
  flights: number
  air_hours: number
  days_per_country: Record<string, number>
  hub_stops: StopItem[]
}

export function hubStops(w: Way): StopItem[] {
  return w.timeline.filter((x): x is StopItem => x.kind !== 'flight')
}

/** Totals for a journey: a ticket shared by both ways is counted once; bags, hub stays and ground kept apart. */
export function totals(data: AppData, j: Journey, sched: Schedule | null): Totals {
  const { inout, map } = data
  const wi = inout.ways[j.wayIn]
  const wh = inout.ways[j.wayHome]
  const p = priceOfWays(inout, [wi, wh])
  let regional = 0
  let ground = 0
  let groundUnknown = 0
  let flights = wi.flights + wh.flights
  let air = wi.flying_hours + wh.flying_hours
  for (const pl of j.places) {
    const h = pl.hop
    if (!h) continue
    if (h.mode === 'flight') {
      flights += 1 + (h.flight?.via.length ?? 0)
      regional += h.price_dkk ?? 0
      air += h.hours ?? 0
    } else if (h.price_dkk == null) groundUnknown++
    else ground += h.price_dkk
  }
  const stops = [...hubStops(wi), ...hubStops(wh)].filter((s) => s.kind === 'night' || s.kind === 'day_stop' || s.kind === 'self_transfer')
  let hubStay: number | null = 0
  let hubNights = 0
  for (const s of stops) {
    hubNights += s.nights || 0
    if (s.nights) hubStay = hubStay == null || s.stay_estimate_dkk == null ? null : hubStay + s.stay_estimate_dkk
  }
  const days: Record<string, number> = {}
  const countryOf = (node: string) => map.nodes.find((n) => n.id === node)?.country ?? inout.airports[node]?.country ?? '?'
  if (sched) sched.places.forEach((sp) => { days[countryOf(sp.node)] = (days[countryOf(sp.node)] ?? 0) + sp.days })
  for (const s of stops) if (s.nights) {
    const c = inout.airports[s.airport]?.country ?? '?'
    days[c] = (days[c] ?? 0) + s.nights
  }
  return {
    tickets_dkk: p.price_dkk,
    regional_flights_dkk: regional,
    cabin_bag_dkk: p.cabin,
    checked_bag_dkk: p.checked,
    hub_nights: hubNights,
    hub_stay_dkk: hubStay,
    ground_dkk: ground,
    ground_unknown: groundUnknown,
    flights,
    air_hours: Math.round(air * 10) / 10,
    days_per_country: days,
    hub_stops: stops,
  }
}

export function journeyIsValid(j: unknown): j is Journey {
  const x = j as Journey
  return !!x && typeof x.id === 'string' && typeof x.wayIn === 'string' && typeof x.wayHome === 'string' && Array.isArray(x.places)
}

export function nodeName(map: MapData, inout: InOut, id: string): string {
  return map.nodes.find((n) => n.id === id)?.name ?? inout.airports[id]?.name ?? id
}
