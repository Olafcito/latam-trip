import type { Booking, Lodging, LodgingRoom } from '../data/types'
import { paidPrice } from './booked'
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
  /** the nights of this part. Without it, or null, the part takes the nights that remain at the stop */
  nights?: number | null
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

/** The stop's nights by its count of nights, as its parts take them. A stop with no nights has its first night as its last, so a stay booked from that day still meets it. */
const stopNights = (sp: ScheduledPlace) => ({ first: sp.inDay, last: addDays(sp.inDay, Math.max(1, sp.days) - 1) })

/** How many of the booking's nights fall from first to last. */
function nightsIn(b: Booking, first: string, last: string): number {
  const from = b.check_in! > first ? b.check_in! : first
  const end = addDays(b.check_out!, -1)
  const to = end < last ? end : last
  return to < from ? 0 : dayDiff(from, to) + 1
}

/**
 * The trip's booked stays: the ones booked for this trip, and the ones booked for no trip at a place the trip stops at.
 * They are found by the trip and the place, not by the nights, so a stay the stops have moved off is still the trip's.
 */
export function tripStays(j: Journey, sched: Schedule, bookings: Booking[]): Booking[] {
  const nodes = new Set(sched.places.map((sp) => sp.node))
  return bookings.filter(
    (b) => b.status === 'booked' && b.kind === 'stay' && !!b.place_id && !!b.check_in && !!b.check_out && (b.trip_id === j.id || (b.trip_id == null && nodes.has(b.place_id))),
  )
}

export interface StayClash {
  booking: Booking
  /** the stop at the booking's place nearest to its nights, null when the trip no longer stops there */
  stop: number | null
  /** true when the stop still has some of the booking's nights */
  meets: boolean
}

/**
 * The trip's booked stays that no stop covers: the stops at the place have moved partly or wholly off its nights, or the
 * trip no longer stops there. Each is pinned to the stop at its place that has most of its nights, or the nearest one.
 */
export function stayClashes(j: Journey, sched: Schedule, bookings: Booking[]): StayClash[] {
  const out: StayClash[] = []
  for (const b of tripStays(j, sched, bookings)) {
    const at = sched.places.map((sp, k) => ({ sp, k })).filter((x) => x.sp.node === b.place_id)
    if (!at.length) {
      out.push({ booking: b, stop: null, meets: false })
      continue
    }
    const has = at.map(({ sp, k }) => {
      const n = stopNights(sp)
      const inside = sp.days > 0 && b.check_in! >= n.first && addDays(b.check_out!, -1) <= n.last
      const away = Math.min(Math.abs(dayDiff(n.first, b.check_in!)), Math.abs(dayDiff(n.last, addDays(b.check_out!, -1))))
      return { k, inside, meet: nightsIn(b, n.first, n.last), away }
    })
    if (has.some((h) => h.inside)) continue
    const best = [...has].sort((a, c) => c.meet - a.meet || a.away - c.away)[0]
    out.push({ booking: b, stop: best.k, meets: best.meet > 0 })
  }
  return out
}

/** The trip's booked stays at the stop that are this part: the same place to stay, or none named, on nights that meet the part's. */
function partBookings(stays: Booking[], sp: ScheduledPlace, part: StayPart): Booking[] {
  if (!part.fits) return []
  return stays.filter(
    (b) => b.place_id === sp.node && (b.lodging_id == null || b.lodging_id === part.stay.lodging_id) && nightsIn(b, part.first, part.last) > 0,
  )
}

/** The booked stay of the trip that is this part at the stop, the first when there are more. */
export function partBooking(j: Journey, sched: Schedule, bookings: Booking[], sp: ScheduledPlace, part: StayPart): Booking | null {
  return partBookings(tripStays(j, sched, bookings), sp, part)[0] ?? null
}

/**
 * The planned stays' cost and unknown parts, and the ids of the booked stays a planned part stands in for.
 * A part pays only for the nights no booking with its price filled in covers, at the part's price per night.
 */
function planned(j: Journey, sched: Schedule, lodgings: Lodging[], bookings: Booking[]) {
  let dkk = 0
  let unknown = 0
  const standsIn = new Set<string>()
  const stays = tripStays(j, sched, bookings)
  j.places.forEach((p, k) => {
    const sp = sched.places[k]
    if (!sp || !p.stays?.length) return
    for (const part of stayParts(p.stays, sp)) {
      if (!part.fits) continue
      const covered = new Set<string>()
      for (const b of partBookings(stays, sp, part)) {
        if (paidPrice(bookings, b) == null) {
          standsIn.add(b.id)
          continue
        }
        for (let d = part.first; d <= part.last; d = addDays(d, 1)) if (d >= b.check_in! && d < b.check_out!) covered.add(d)
      }
      const open = part.nights - covered.size
      if (open <= 0) continue
      const room = lodgings.find((l) => l.id === part.stay.lodging_id)?.rooms.find((r) => r.id === part.stay.room_id)
      const cost = partDkk(room, part)
      if (cost == null) unknown++
      else dkk += Math.round((cost / part.nights) * open)
    }
  })
  return { dkk, unknown, standsIn }
}

/**
 * What the planned stays of the trip cost, and how many parts have no price known, so a part with no price never
 * makes the trip look cheaper. The nights of a part that are booked with the price filled in are counted with the
 * booked stays, not here. A booked part with no price filled in counts its planned price in its place.
 */
export function plannedStays(j: Journey, sched: Schedule, lodgings: Lodging[], bookings: Booking[] = []): { dkk: number; unknown: number } {
  const { dkk, unknown } = planned(j, sched, lodgings, bookings)
  return { dkk, unknown }
}

export const plannedStaysDkk = (j: Journey, sched: Schedule, lodgings: Lodging[], bookings: Booking[] = []) => plannedStays(j, sched, lodgings, bookings).dkk

export interface StayTotals {
  /** what the trip's booked stays cost, each once */
  booked: number
  planned: number
  /** planned parts with no price known, and booked stays with no price filled in that no planned part stands in for */
  unknown: number
}

/**
 * The trip's stays. A booked stay counts once, also one the stops have moved off, as that one is paid all the same.
 * One with no price filled in is not known unless a planned part stands in for it. Without the places to stay
 * nothing planned or unknown is worked out.
 */
export function stayTotals(j: Journey, sched: Schedule, bookings: Booking[], lodgings?: Lodging[]): StayTotals {
  const noPrice = new Set<string>()
  let booked = 0
  for (const b of tripStays(j, sched, bookings)) {
    const paid = paidPrice(bookings, b)
    if (paid == null) noPrice.add(b.id)
    else booked += paid
  }
  if (!lodgings) return { booked, planned: 0, unknown: 0 }
  const p = planned(j, sched, lodgings, bookings)
  for (const id of p.standsIn) noPrice.delete(id)
  return { booked, planned: p.dkk, unknown: p.unknown + noPrice.size }
}
