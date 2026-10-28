import type { SeedSegment, SeedWay, Trip } from '@map/data/trips'
import type { CrawledFlight, InOut, Ticket, Way } from '../data/types'
import { dayDiff } from './format'
import { nodeForAirport, type Hop, type Journey, type Place } from './journey'

// The ranked trips in data/saved_trips.json join the planner as journeys, once per browser.
// Their long-haul ways are kept under the seed's own ids: way ids in inout.json change with
// every build, the seed's copy of its ways does not.

export const OVERLAND = 'Overland, your own route'

export const seedWayId = (seedId: string, dir: 'in' | 'home') => `${seedId}:${dir}`

function asWay(w: SeedWay, id: string, direction: 'in' | 'home'): Way {
  const x = w as Partial<Way> & SeedWay
  return {
    id,
    direction,
    type: (x.type as Way['type']) ?? 'ticket',
    from: w.from,
    to: w.to,
    depart: w.depart ?? '',
    arrive: w.arrive ?? '',
    total_hours: w.total_hours ?? 0,
    flying_hours: w.flying_hours ?? 0,
    flights: x.flights ?? w.timeline.filter((t) => t.kind === 'flight').length,
    hub_nights: w.hub_nights,
    changes: x.changes ?? 0,
    us_transit: w.us_transit,
    airports: w.airports,
    tickets: x.tickets ?? [],
    shared_ticket: w.shared_ticket ?? null,
    price_dkk: w.price_dkk ?? 0,
    extras: { hub_nights: w.hub_nights, hub_stay_estimate_dkk: null, checked_bag_fees_dkk: null, ...x.extras, cabin_bag_fees_dkk: w.extras?.cabin_bag_fees_dkk ?? null },
    score: x.score ?? 0,
    timeline: w.timeline as Way['timeline'],
  }
}

/** inout with every seed's way in and way home added, and any ticket of theirs the build lacks. */
export function withSeedWays(inout: InOut, seeds: Trip[]): InOut {
  const ways = { ...inout.ways }
  const tickets = { ...inout.tickets }
  for (const s of seeds) {
    const io = s.inout
    if (!io) continue
    for (const dir of ['in', 'home'] as const) {
      const id = seedWayId(s.id, dir)
      const w = asWay(dir === 'in' ? io.way_in : io.way_home, id, dir)
      ways[id] = w
      // a ticket shared by both ways carries the in/out price; a way's own ticket carries the way's price
      w.tickets.forEach((t, k) => {
        if (tickets[t]) return
        const shared = t === w.shared_ticket || io.type === 'ticket'
        tickets[t] = {
          id: t, quote_id: t.replace(/^T/, ''), source: 'saved_trips.json', observed_at: '', structure: shared ? 'return' : 'one_way', legs: [],
          price_dkk: k === 0 ? (shared ? io.price_dkk : w.price_dkk) : 0, fare_brand: null, cabin_bag: null, checked_bag: null,
          cabin_bag_fee_dkk: k === 0 ? (shared ? io.extras?.cabin_bag_fees_dkk ?? null : w.extras.cabin_bag_fees_dkk) : 0,
          checked_bag_fee_dkk: null, tickets_inside: 1, self_transfer: false, carriers: [], flags: [], notes: null, link: null,
        } satisfies Ticket
      })
    }
  }
  return { ...inout, ways, tickets }
}

interface FlightSegment {
  quote_id?: string
  hours?: number
  layover_h?: (number | null)[]
  fare_brand?: string | null
  cabin_bag?: string | null
  source?: string
}

/** A seed as a journey: overland blocks and priced flights in order, nights spread over the days between the dated flights. */
export function seedToJourney(inout: InOut, seed: Trip): Journey | null {
  const io = seed.inout
  if (!io) return null
  const wi = io.way_in
  const wh = io.way_home
  const places: Place[] = [{ node: nodeForAirport(inout, io.entry), nights: 0, hop: null }]
  const add = (to: string, hop: Hop) => places.push({ node: to, nights: 0, hop })
  const segments: SeedSegment[] = seed.segments?.length
    ? seed.segments
    : seed.legs.map((l) => ({ kind: l.mode === 'flight' ? 'flight' : 'overland', from: l.from, to: l.to }))
  for (const g of segments) {
    const prev = places[places.length - 1].node
    if (g.from === g.to) continue
    if (g.from !== prev) add(g.from, { from: prev, to: g.from, mode: 'bus', operator: OVERLAND, hours: null, price_dkk: null, overnight: false, border: false, flight: null, overland: OVERLAND })
    if (g.kind === 'overland') {
      const note = g.note || OVERLAND
      add(g.to, { from: g.from, to: g.to, mode: 'bus', operator: note, hours: null, price_dkk: null, overnight: false, border: (g.countries?.length ?? 0) > 1, flight: null, overland: note })
      continue
    }
    const f = g as typeof g & FlightSegment
    const flight: CrawledFlight | null = f.depart && f.arrive
      ? {
          quote_id: f.quote_id ?? '', depart: f.depart, arrive: f.arrive, hours: f.hours ?? 0, price_dkk: f.price_dkk ?? 0,
          carriers: f.carriers ?? [], via: f.via ?? [], layover_h: f.layover_h ?? [], fare_brand: f.fare_brand ?? null,
          cabin_bag: f.cabin_bag ?? null, source: f.source,
        }
      : null
    add(g.to, { from: g.from, to: g.to, mode: 'flight', operator: f.carriers?.join(', ') || null, hours: f.hours ?? null, price_dkk: f.price_dkk ?? null, overnight: false, border: false, flight })
  }
  spreadNights(places, wi.arrive, wh.depart)
  return {
    id: seed.id,
    name: seed.name,
    wayIn: seedWayId(seed.id, 'in'),
    wayHome: seedWayId(seed.id, 'home'),
    optionId: null,
    places,
    rank: seed.rank,
  }
}

/**
 * Nights between two dated moments (the landing, a flight, the flight home) are shared by the
 * places in between: evenly, the first place taking what is left over.
 */
function spreadNights(places: Place[], landed: string | null, homeDepart: string | null) {
  let start = 0
  let since = landed
  const share = (end: number, until: string | null) => {
    const n = end - start + 1
    const days = since && until ? Math.max(0, dayDiff(since, until)) : 2 * n
    for (let k = start; k <= end; k++) places[k].nights = Math.floor(days / n) + (k === start ? days % n : 0)
  }
  places.forEach((_, i) => {
    const next = places[i + 1]?.hop
    if (next?.flight) {
      share(i, next.flight.depart)
      start = i + 1
      since = next.flight.arrive
    }
  })
  share(places.length - 1, homeDepart)
}
