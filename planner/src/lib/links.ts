// Where to look a flight up again: the page its price was seen on, or a Momondo search for the same legs and days.
import type { InOut, Ticket, Way } from '../data/types'
import type { Hop } from './journey'

export interface Leg { from: string; to: string; date: string }

export interface FlightLink {
  href: string
  /** the site the link opens */
  site: string
  /** true when it is the page the price was seen on, false for a fresh search */
  saved: boolean
  /** the legs of this ticket, in order */
  legs: Leg[]
}

const SITE: Record<string, string> = {
  momondo: 'Momondo',
  'momondo-manual': 'Momondo',
  kiwi: 'Kiwi.com',
  google_flights: 'Google Flights',
  'google-flights-manual': 'Google Flights',
  expedia: 'Expedia',
}

/** A Momondo search, DKK, cheapest first: one leg is a one way, more legs are a multi-city search. */
export function momondoSearch(legs: readonly Leg[]): string {
  return 'https://www.momondo.dk/flight-search/' + legs.map((l) => `${l.from}-${l.to}/${l.date}`).join('/') + '?sort=price_a'
}

function siteOf(source: string, href: string): string {
  if (SITE[source]) return SITE[source]
  try { return new URL(href).hostname.replace(/^www\./, '') } catch { return 'Link' }
}

function linkFor(t: Ticket | undefined, legs: Leg[]): FlightLink | null {
  if (t?.link && /^https?:\/\//.test(t.link)) return { href: t.link, site: siteOf(t.source, t.link), saved: true, legs }
  if (!legs.length) return null
  return { href: momondoSearch(legs), site: 'Momondo', saved: false, legs }
}

/** The legs of one ticket inside ways: its flights in a row on one way make one leg. */
function ticketLegs(ticket: string, ways: readonly Way[]): Leg[] {
  const legs: Leg[] = []
  for (const w of ways) {
    let cur: Leg | null = null
    for (const t of w.timeline) {
      if (t.kind !== 'flight') continue
      if (t.ticket !== ticket) { cur = null; continue }
      if (cur) cur.to = t.to
      else legs.push((cur = { from: t.from, to: t.to, date: t.depart.slice(0, 10) }))
    }
  }
  return legs
}

/** One link per ticket of a way. A ticket shared with the other way (open jaw, return) searches both legs. */
export function wayLinks(way: Way, inout: InOut, other?: Way | null): FlightLink[] {
  other ??= way.paired_with ? inout.ways[way.paired_with] : null
  const out: FlightLink[] = []
  for (const id of way.tickets) {
    const ways = other && other.tickets.includes(id) ? (way.direction === 'in' ? [way, other] : [other, way]) : [way]
    const l = linkFor(inout.tickets[id], ticketLegs(id, ways))
    if (l) out.push(l)
  }
  return out
}

/** The airport code of a map node or airport id, or null. */
function airportOf(inout: InOut, id: string): string | null {
  if (inout.airports[id]) return id
  const hit = Object.entries(inout.airports).find(([, a]) => a.map_node === id)
  return hit ? hit[0] : null
}

/** The link of a flight between two stops, or null for a hop that is not a flight. */
export function hopLink(h: Hop, inout: InOut): FlightLink | null {
  const f = h.flight
  if (!f) return null
  const t = inout.tickets['T' + f.quote_id]
  const date = f.depart.slice(0, 10)
  const fromLegs = (t?.legs ?? []).map((s) => s.split('>')).filter((p) => p.length === 2)
  let legs: Leg[] = fromLegs.length ? fromLegs.map(([from, to]) => ({ from, to, date })) : []
  if (!legs.length) {
    const from = airportOf(inout, h.from)
    const to = airportOf(inout, h.to)
    if (from && to) legs = [{ from, to, date }]
  }
  return linkFor(t, legs)
}
