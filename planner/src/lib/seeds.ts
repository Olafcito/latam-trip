import type { SeedSegment, SeedWay, Trip } from '@map/data/trips'
import type { CrawledFlight, InOut, Ticket, Way } from '../data/types'
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

/** A seed as a journey: overland blocks and priced flights in order. */
export function seedToJourney(inout: InOut, seed: Trip): Journey | null {
  const io = seed.inout
  if (!io) return null
  const places: Place[] = [{ node: nodeForAirport(inout, io.entry), hop: null }]
  const add = (to: string, hop: Hop) => places.push({ node: to, hop })
  const segments: SeedSegment[] = seed.segments?.length
    ? seed.segments
    : seed.legs.map((l) => ({ kind: l.mode === 'flight' ? 'flight' : 'overland', from: l.from, to: l.to }))
  for (const g of segments) {
    const prev = places[places.length - 1].node
    if (g.from === g.to) continue
    if (g.from !== prev) add(g.from, { from: prev, to: g.from, mode: 'bus', operator: OVERLAND, hours: null, price_dkk: null, overnight: false, border: false, flight: null, overland: OVERLAND })
    if (g.kind === 'overland') {
      const note = g.note || OVERLAND
      add(g.to, { from: g.from, to: g.to, mode: 'bus', operator: note, hours: null, price_dkk: null, overnight: false, border: (g.countries?.length ?? 0) > 1, flight: null, overland: note, ...(g.countries?.length ? { countries: g.countries } : {}) })
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
 * A seeded journey saved before its overland blocks carried their countries, given them from the seed.
 * Only a block that still runs between the seed's own two places is touched. The same journey back when nothing changes.
 */
export function withSeedCountries(j: Journey, seeds: readonly Trip[]): Journey {
  const seed = seeds.find((t) => t.id === j.id)
  if (!seed?.segments?.length) return j
  let changed = false
  const places = j.places.map((p) => {
    const h = p.hop
    if (!h?.overland || h.countries) return p
    const g = seed.segments!.find((x) => x.kind === 'overland' && x.from === h.from && x.to === h.to && x.countries?.length)
    if (!g) return p
    changed = true
    return { ...p, hop: { ...h, countries: g.countries } }
  })
  return changed ? { ...j, places } : j
}
