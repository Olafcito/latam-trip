import type { Booking, InOut, MapNode, Way } from '../data/types'
import { legDay, type Journey, type Schedule } from './journey'
import { addDays } from './time'

// A booking is a fact about the world, not about one trip (spec 4.1). It matches a leg by its two ends and the day
// the leg leaves, and a stop by its place and nights. Cancelled rows are dropped here, never by callers.

/** What the matching reads of the app data: the airports and ways of inout and the places of the map. */
export interface BookData {
  inout: Pick<InOut, 'airports' | 'ways'>
  map: { nodes: readonly Pick<MapNode, 'id' | 'iata'>[] }
}

const byIata = new WeakMap<object, Map<string, string>>()

/** Every place with an iata gives that code its id, and the place whose id is the code wins. As airport_node in core.py. */
function iataNodes(nodes: BookData['map']['nodes']): Map<string, string> {
  let m = byIata.get(nodes)
  if (!m) {
    m = new Map()
    for (const p of nodes) if (p.iata && (p.id === p.iata || !m.has(p.iata))) m.set(p.iata, p.id)
    byIata.set(nodes, m)
  }
  return m
}

/** The map node of an airport code: a place with that iata, else the airport's map node, else the code itself. */
export function codeNode(data: BookData, code: string): string {
  return iataNodes(data.map.nodes).get(code) ?? data.inout.airports[code]?.map_node ?? code
}

const booked = (list: Booking[]) => list.filter((b) => b.status === 'booked')
const isLeg = (b: Booking) => b.kind !== 'stay' && !!b.depart
const dayOf = (b: Booking) => b.depart!.slice(0, 10)

/** Whether the booking runs between these two nodes, in this order. */
export function endsMatch(data: BookData, b: Booking, from: string, to: string): boolean {
  return !!b.from_code && !!b.to_code && codeNode(data, b.from_code) === from && codeNode(data, b.to_code) === to
}

/** The booked row with the leg's ends that leaves on the leg's day. */
export function bookingOn(list: Booking[], data: BookData, leg: { from: string; to: string; day: string }): Booking | null {
  return booked(list).find((b) => isLeg(b) && dayOf(b) === leg.day && endsMatch(data, b, leg.from, leg.to)) ?? null
}

/** A booked row with the leg's ends on another day, when none is on the leg's day. */
export function bookedElsewhere(list: Booking[], data: BookData, leg: { from: string; to: string; day: string }): Booking | null {
  if (bookingOn(list, data, leg)) return null
  return booked(list).find((b) => isLeg(b) && endsMatch(data, b, leg.from, leg.to)) ?? null
}

/** The booked stays at the place whose nights, check_in to the night before check_out, fall inside the stop's. */
export function staysIn(list: Booking[], placeNode: string, nights: { first: string; last: string }): Booking[] {
  return booked(list).filter(
    (b) => b.kind === 'stay' && b.place_id === placeNode && !!b.check_in && !!b.check_out && b.check_in >= nights.first && addDays(b.check_out, -1) <= nights.last,
  )
}

/** A booked stay at the place whose nights fall inside the stop's first and last night. */
export function stayOn(list: Booking[], placeNode: string, nights: { first: string; last: string }): Booking | null {
  return staysIn(list, placeNode, nights)[0] ?? null
}

/** sorts after every depart, so a row with none comes last */
const LAST = '\uffff'

/** What a row paid. A ticket over several rows is paid once, by its first row: the earliest depart, then the lowest id. */
export function paidPrice(list: Booking[], b: Booking): number {
  if (b.ticket == null) return b.price_dkk ?? 0
  const group = [b, ...booked(list).filter((r) => r.ticket === b.ticket && r.id !== b.id)]
  const first = group.reduce((a, r) => {
    const da = a.depart ?? LAST
    const dr = r.depart ?? LAST
    return dr < da || (dr === da && r.id < a.id) ? r : a
  })
  return first.id === b.id ? (b.price_dkk ?? 0) : 0
}

/** The booked row of a way in or home, on the way's two ends and the day it leaves. */
export function wayBooking(list: Booking[], data: BookData, w: Pick<Way, 'from' | 'to' | 'depart'>): Booking | null {
  return bookingOn(list, data, { from: codeNode(data, w.from), to: codeNode(data, w.to), day: w.depart.slice(0, 10) })
}

/** Whether next would replace now, a booked way that is not unlocked. A booked way holds until its booking is changed. */
export function wayHeld(list: Booking[], data: BookData, now: Way | undefined, next: Way, unlocked: boolean): boolean {
  return !!now && next.id !== now.id && !unlocked && !!wayBooking(list, data, now)
}

/** What a pick that would change a booked way says in its place. */
export function heldWayNotice(side: 'in' | 'home'): string {
  return `The ${side === 'in' ? 'way in' : 'way home'} is booked. Change it from its booking.`
}

/** The place indexes whose leg is booked on the day it shows. A night move or a day set by hand leaves them on that day. */
export function lockedLegs(list: Booking[], data: BookData, j: Journey, sched: Schedule): Set<number> {
  const live = booked(list)
  const locked = new Set<number>()
  if (!live.length) return locked
  j.places.forEach((p, k) => {
    if (k === 0 || !p.hop || !sched.places[k - 1]) return
    if (bookingOn(live, data, { from: j.places[k - 1].node, to: p.node, day: legDay(p.hop, sched.places[k - 1].outDay) })) locked.add(k)
  })
  return locked
}

/** How many legs, ways and stays of a trip are booked, for the trips list. */
export function bookedCount(list: Booking[], data: BookData, j: Journey, sched: Schedule): number {
  const live = booked(list)
  if (!live.length) return 0
  let n = lockedLegs(live, data, j, sched).size
  for (const id of [j.wayIn, j.wayHome]) {
    const w = data.inout.ways[id]
    if (w && wayBooking(live, data, w)) n++
  }
  const seen = new Set<string>()
  for (const s of sched.places) {
    if (s.outDay <= s.inDay) continue
    for (const b of staysIn(live, s.node, { first: s.inDay, last: addDays(s.outDay, -1) })) seen.add(b.id)
  }
  return n + seen.size
}
