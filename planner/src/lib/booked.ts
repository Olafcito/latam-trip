import type { Booking, InOut, MapNode, Way } from '../data/types'
import { weekdayDay } from './format'
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

/**
 * What a row paid. A ticket over several rows is paid once, by its first row: the earliest depart, then the lowest id.
 * null when the price was not filled in, on every row of its ticket, so a total counts the quote in its place.
 */
export function paidPrice(list: Booking[], b: Booking): number | null {
  if (b.ticket == null) return b.price_dkk
  const first = firstOf([b, ...booked(list).filter((r) => r.ticket === b.ticket && r.id !== b.id)])
  if (first.price_dkk == null) return null
  return first.id === b.id ? first.price_dkk : 0
}

/** The row of a ticket that pays for it: the earliest depart, then the lowest id. */
function firstOf(group: Booking[]): Booking {
  return group.reduce((a, r) => {
    const da = a.depart ?? LAST
    const dr = r.depart ?? LAST
    return dr < da || (dr === da && r.id < a.id) ? r : a
  })
}

/**
 * The rows to save with the price of a ticket kept. A save that takes the paying row out of its ticket while other
 * rows of it stay booked hands its price to the row that pays now, so those rows never read 0 paid. That row is
 * changed in the rows when it is saved too, else added as a row with its id and the price.
 */
export function keepPaid(list: Booking[], rows: Partial<Booking>[]): Partial<Booking>[] {
  const out = [...rows]
  const leaves = (b: Booking) => out.some((r) => r.id === b.id && 'ticket' in r && r.ticket !== b.ticket)
  const done = new Set<string>()
  for (const r of rows) {
    const was = r.id ? booked(list).find((b) => b.id === r.id) : undefined
    const t = was?.ticket
    if (!t || done.has(t)) continue
    done.add(t)
    const group = booked(list).filter((b) => b.ticket === t)
    const payer = firstOf(group)
    const left = group.filter((b) => !leaves(b))
    if (!leaves(payer) || !left.length || payer.price_dkk == null) continue
    const next = firstOf(left)
    const k = out.findIndex((x) => x.id === next.id)
    if (k >= 0) out[k] = { ...out[k], price_dkk: payer.price_dkk }
    else out.push({ id: next.id, price_dkk: payer.price_dkk })
  }
  return out
}

/** The day a booking holds its leg on, the leg day when it has none, and null for a leg with no booking. */
export function bookedDay(booking: Pick<Booking, 'depart'> | null | undefined, legDay: string): string | null {
  return booking ? booking.depart?.slice(0, 10) ?? legDay : null
}

/**
 * What a pick in a sheet does. A booked leg is held while it is locked, and nothing picks there. Unlocked with
 * Change booking, a pick opens the booking form through onRebook. So a plain pick never reaches a booked leg.
 */
export function bookedGate<T>(o: { booking: unknown; unlocked?: boolean; onRebook?: (x: T) => void; pick: (x: T) => void }): { hold: boolean; choose: ((x: T) => void) | undefined } {
  if (!o.booking) return { hold: false, choose: o.pick }
  return o.unlocked ? { hold: false, choose: o.onRebook } : { hold: true, choose: undefined }
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

/** The green mark on a trip row, "3 booked". Nothing when none of it is booked. */
export function bookedMark(n: number): string | null {
  return n > 0 ? `${n} booked` : null
}

/** What sits under a flight's price, in the column where Pick sits on the other rows. */
export interface PriceColumn {
  chip: 'Booked' | 'Picked' | null
  pick: boolean
  remove: boolean
}

/**
 * A row's state under its price. A picked row shows its chip in place of Pick. Booked is the flight the booking is for,
 * changed from its booking and not removed here. A picked flight on a booked leg that is not the booked one reads Picked,
 * and has no Remove either, since the leg stays locked until its booking changes.
 */
export function priceColumn(row: { picked: boolean; booked: boolean; locked?: boolean; canPick: boolean; canRemove: boolean }): PriceColumn {
  if (row.booked) return { chip: 'Booked', pick: false, remove: false }
  if (row.picked) return { chip: 'Picked', pick: false, remove: row.canRemove && !row.locked }
  return { chip: null, pick: row.canPick, remove: false }
}

/** Whether a flight is the one a booking is for: the same departure, to the minute. */
export function isBookedFlight(booking: Pick<Booking, 'depart'> | null | undefined, flight: { depart: string } | null | undefined): boolean {
  return !!booking?.depart && !!flight?.depart && booking.depart.slice(0, 16) === flight.depart.slice(0, 16)
}

/** The row at the top of a sheet for a picked flight set aside when its leg moved to another day, so it is never lost. */
export function parkedRow(parked: { depart: string } | null | undefined, legDay: string): { title: string; day: string } | null {
  if (!parked) return null
  const day = parked.depart.slice(0, 10)
  return day === legDay ? null : { title: `Picked for ${weekdayDay(day)}`, day }
}
