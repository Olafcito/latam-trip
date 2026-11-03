import type { Booking, Lodging, LodgingRoom } from '../data/types'
import { paidPrice, staysIn } from './booked'
import { dayDiff } from './format'
import type { Journey, Schedule, ScheduledPlace } from './journey'
import { addDays } from './time'

// Where you plan to sleep at a stop. A stop holds its planned stays in order, each a room of a place
// to stay, and they run from the stop's first night. A part without nights takes what is left, so it
// follows the stop when a leg before it moves. Prices are looked up again for the dates the part has now.

export interface PlannedStay {
  lodging_id: string
  /** the room, null until one is picked. A part with no room has no price */
  room_id: string | null
  /** the nights of this part. Without it the part takes the nights that remain at the stop */
  nights?: number
}

export interface StayPart {
  stay: PlannedStay
  /** the first and the last night of the part. A part with 0 nights has its last night the day before its first */
  first: string
  last: string
  nights: number
  /** false for a part the stop has no nights left for */
  fits: boolean
}

/** The parts of a stop's stays in order from its first night. A part longer than what is left is cut to it, a part after that has 0 nights. */
export function stayParts(stays: PlannedStay[], sp: ScheduledPlace): StayPart[] {
  let left = Math.max(0, sp.days)
  let at = sp.inDay
  return stays.map((stay) => {
    const want = stay.nights ?? left
    const nights = Math.max(0, Math.min(want, left))
    const part = { stay, first: at, last: addDays(at, nights - 1), nights, fits: nights > 0 }
    left -= nights
    at = addDays(at, nights)
    return part
  })
}

export type StayPrice = { total: number; exact: true } | { total: number; exact: false; check_in: string; check_out: string }

/**
 * The room's price for the nights from first. Exact when a price is for those very nights, the cheapest of them.
 * Otherwise the price whose dates are nearest, with its own total and dates, the latest seen when two are as near.
 * A price that covers only some of the nights is a nearest price, not a match. null with no prices or no nights.
 */
export function priceFor(room: LodgingRoom, first: string, nights: number): StayPrice | null {
  if (nights <= 0 || !room.prices.length) return null
  const out = addDays(first, nights)
  const priced = room.prices
    .map((p) => ({ p, total: p.total_dkk ?? (p.per_night_dkk == null ? null : p.per_night_dkk * dayDiff(p.check_in, p.check_out)) }))
    .filter((x): x is { p: LodgingRoom['prices'][number]; total: number } => x.total != null)
  const same = priced.filter((x) => x.p.check_in === first && x.p.check_out === out).sort((a, b) => a.total - b.total)[0]
  if (same) return { total: same.total, exact: true }
  const away = (x: (typeof priced)[number]) => Math.abs(dayDiff(first, x.p.check_in)) + Math.abs(dayDiff(out, x.p.check_out))
  const near = [...priced].sort((a, b) => away(a) - away(b) || (b.p.observed_at < a.p.observed_at ? -1 : b.p.observed_at > a.p.observed_at ? 1 : 0) || a.total - b.total)[0]
  if (!near) return null
  return { total: near.total, exact: false, check_in: near.p.check_in, check_out: near.p.check_out }
}

/** What the part costs: an exact price as it is, a nearest one per night times the part's nights. null when nothing is known. */
export function partDkk(room: LodgingRoom | undefined, part: StayPart): number | null {
  if (!room) return null
  const pr = priceFor(room, part.first, part.nights)
  if (!pr) return null
  if (pr.exact) return pr.total
  const per = pr.total / Math.max(1, dayDiff(pr.check_in, pr.check_out))
  return Math.round(per * part.nights)
}

/** The stop's nights as a first and a last night. A stop with no nights has its first night as its last, so a stay booked from that day still meets it. */
const stopNights = (sp: ScheduledPlace) => ({ first: sp.inDay, last: sp.outDay > sp.inDay ? addDays(sp.outDay, -1) : sp.inDay })

/** The booked stays at the stop's place on nights that meet the stop's, also one the stop cuts into, as that one is paid all the same. */
export function bookedStaysAt(bookings: Booking[], sp: ScheduledPlace): Booking[] {
  const { first, last } = stopNights(sp)
  return bookings.filter(
    (b) => b.status === 'booked' && b.kind === 'stay' && b.place_id === sp.node && !!b.check_in && !!b.check_out && b.check_in <= last && addDays(b.check_out, -1) >= first,
  )
}

/** The booked stays the stop's nights no longer cover: they meet the stop but have a night before or after it. */
export function cutStays(bookings: Booking[], sp: ScheduledPlace): Booking[] {
  const inside = new Set(sp.outDay > sp.inDay ? staysIn(bookings, sp.node, stopNights(sp)).map((b) => b.id) : [])
  return bookedStaysAt(bookings, sp).filter((b) => !inside.has(b.id))
}

/** The booked stays at the stop that are this part: the same place to stay, on nights that meet the part's. */
function partBookings(bookings: Booking[], sp: ScheduledPlace, part: StayPart): Booking[] {
  if (!part.fits || sp.outDay <= sp.inDay) return []
  return bookedStaysAt(bookings, sp).filter((b) => b.lodging_id === part.stay.lodging_id && b.check_in! <= part.last && addDays(b.check_out!, -1) >= part.first)
}

/** The booked stay at the stop that is this part, the first when there are more. */
export function partBooking(bookings: Booking[], sp: ScheduledPlace, part: StayPart): Booking | null {
  return partBookings(bookings, sp, part)[0] ?? null
}

/** The planned stays' cost and unknown parts, and the ids of the booked stays a planned part stands in for. */
function planned(j: Journey, sched: Schedule, lodgings: Lodging[], bookings: Booking[]) {
  let dkk = 0
  let unknown = 0
  const standsIn = new Set<string>()
  j.places.forEach((p, k) => {
    const sp = sched.places[k]
    if (!sp || !p.stays?.length) return
    for (const part of stayParts(p.stays, sp)) {
      if (!part.fits) continue
      const bs = partBookings(bookings, sp, part)
      // the part is counted with the booked stays only when every booking in it has its price filled in
      if (bs.length && bs.every((b) => paidPrice(bookings, b) != null)) continue
      for (const b of bs) standsIn.add(b.id)
      const room = lodgings.find((l) => l.id === part.stay.lodging_id)?.rooms.find((r) => r.id === part.stay.room_id)
      const cost = partDkk(room, part)
      if (cost == null) unknown++
      else dkk += cost
    }
  })
  return { dkk, unknown, standsIn }
}

/**
 * What the planned stays of the trip cost, and how many parts have no price known, so a part with no price never
 * makes the trip look cheaper. A part that is booked with its price filled in is counted with the booked stays, not here.
 * A booked part with no price filled in counts its planned price in its place.
 */
export function plannedStays(j: Journey, sched: Schedule, lodgings: Lodging[], bookings: Booking[] = []): { dkk: number; unknown: number } {
  const { dkk, unknown } = planned(j, sched, lodgings, bookings)
  return { dkk, unknown }
}

export const plannedStaysDkk = (j: Journey, sched: Schedule, lodgings: Lodging[], bookings: Booking[] = []) => plannedStays(j, sched, lodgings, bookings).dkk

export interface StayTotals {
  /** what the booked stays met by the stops cost, each once */
  booked: number
  planned: number
  /** planned parts with no price known, and booked stays with no price filled in that no planned part stands in for */
  unknown: number
}

/**
 * The trip's stays. A booked stay counts once, even one the stop cuts into, and one with no price filled in is not known
 * unless a planned part stands in for it. Without the places to stay nothing planned or unknown is worked out.
 */
export function stayTotals(j: Journey, sched: Schedule, bookings: Booking[], lodgings?: Lodging[]): StayTotals {
  const seen = new Set<string>()
  const noPrice = new Set<string>()
  let booked = 0
  for (const sp of sched.places) {
    for (const b of bookedStaysAt(bookings, sp)) {
      if (seen.has(b.id)) continue
      seen.add(b.id)
      const paid = paidPrice(bookings, b)
      if (paid == null) noPrice.add(b.id)
      else booked += paid
    }
  }
  if (!lodgings) return { booked, planned: 0, unknown: 0 }
  const p = planned(j, sched, lodgings, bookings)
  for (const id of p.standsIn) noPrice.delete(id)
  return { booked, planned: p.dkk, unknown: p.unknown + noPrice.size }
}
