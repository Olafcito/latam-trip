import type { Family } from '@map/data/types'
import type { Booking, InOut, Way } from '../data/types'
import { bookingOn, paidPrice, wayBooking, type BookData } from './booked'
import { dayDiff } from './format'
import { priceOfWays } from './options'
import { legDay, type Journey, type ScheduledPlace, type Schedule, type Totals } from './journey'
import { familyOf } from './route'
import { addDays } from './time'

// Where a trip stands: every leg booked or open, what it costs split into paid and estimated, and where you
// are on a day of it. Pure, so the status at the top of the trip page and the tests read the same numbers.

/** A leg of the trip: the way in, a leg by its place index, or the way home. */
export type LegKey = 'in' | 'home' | number

export interface LegState {
  key: LegKey
  fam: Family
  /** the place ids at its ends, the airport codes on a way */
  from: string
  to: string
  /** the day it leaves */
  day: string
  booked: boolean
  /** a flight leg with no flight picked */
  unpicked: boolean
  /** what was paid when that is filled in, else what it is expected to cost. null when neither is known. A way has only what was paid */
  price: number | null
  paid: boolean
}

/** The legs of a trip in order, from the way in to the way home, each booked or not with what it costs. */
export function tripLegs(data: BookData, j: Journey, sched: Schedule, wayIn: Way, wayHome: Way, bookings: Booking[]): LegState[] {
  const ofWay = (key: 'in' | 'home', w: Way): LegState => {
    const b = wayBooking(bookings, data, w)
    const paid = b ? paidPrice(bookings, b) : null
    return { key, fam: 'flight', from: w.from, to: w.to, day: w.depart.slice(0, 10), booked: !!b, unpicked: false, price: paid, paid: paid != null }
  }
  const legs: LegState[] = [ofWay('in', wayIn)]
  j.places.forEach((p, i) => {
    const h = p.hop
    if (!h || i === 0 || !sched.places[i - 1]) return
    const from = j.places[i - 1].node
    const day = legDay(h, sched.places[i - 1].outDay)
    const b = bookingOn(bookings, data, { from, to: p.node, day })
    const paid = b ? paidPrice(bookings, b) : null
    const fam = familyOf(h.mode)
    legs.push({ key: i, fam, from, to: p.node, day, booked: !!b, unpicked: fam === 'flight' && !h.flight && !b, price: paid ?? h.price_dkk, paid: paid != null })
  })
  legs.push(ofWay('home', wayHome))
  return legs
}

/** What an open leg asks for. Nothing on a booked one. */
export const legAction = (l: LegState): 'Pick flight' | 'Book' | null => (l.booked ? null : l.unpicked ? 'Pick flight' : 'Book')

export function legCounts(legs: LegState[]): { booked: number; open: number } {
  const booked = legs.filter((l) => l.booked).length
  return { booked, open: legs.length - booked }
}

/** The open leg after the one last shown, round to the first again. null when none is open. */
export function nextOpen(legs: LegState[], after: LegKey | null): LegKey | null {
  const at = after == null ? -1 : legs.findIndex((l) => l.key === after)
  for (let k = 1; k <= legs.length; k++) {
    const l = legs[(at + k + legs.length) % legs.length]
    if (!l.booked) return l.key
  }
  return null
}

export type CostKey = 'long' | 'regional' | 'ground' | 'stays' | 'hub' | 'cabin' | 'checked'

/** One category of what the trip costs. A part with no price is counted, never taken as 0. */
export interface CostPart {
  key: CostKey
  label: string
  paid: number
  estimated: number
  unpriced: number
  /** not in what the trip costs: a checked bag is a choice */
  optional?: boolean
}

/** What the long-haul tickets cost: the part paid on booked ways, and the quote of the ways not paid. */
export interface TicketSplit { paid: number; quoted: number }

/** The long-haul tickets split by the ways: what the booked ones paid, and the quote of the others, a shared ticket once. */
export function ticketSplit(inout: Pick<InOut, 'tickets'>, legs: LegState[], wayIn: Way, wayHome: Way): TicketSplit {
  const ends = [legs.find((l) => l.key === 'in'), legs.find((l) => l.key === 'home')]
  const quoted = [wayIn, wayHome].filter((_, k) => !ends[k]?.paid)
  const paid = ends.reduce((a, l) => a + (l?.paid ? l.price ?? 0 : 0), 0)
  return { paid, quoted: quoted.length ? priceOfWays(inout as InOut, quoted).price_dkk : 0 }
}

/** The categories of the trip's cost with something in them, each split into paid, estimated and not priced. */
export function costParts({ legs, tickets, t }: { legs: LegState[]; tickets: TicketSplit; t: Totals }): CostPart[] {
  const ofLegs = (key: CostKey, label: string, keep: (l: LegState) => boolean): CostPart => {
    const part: CostPart = { key, label, paid: 0, estimated: 0, unpriced: 0 }
    for (const l of legs) {
      if (typeof l.key !== 'number' || !keep(l)) continue
      if (l.price == null) part.unpriced++
      else if (l.paid) part.paid += l.price
      else part.estimated += l.price
    }
    return part
  }
  const fee = (key: CostKey, label: string, dkk: number | null, optional?: boolean): CostPart => ({
    key, label, paid: 0, estimated: dkk ?? 0, unpriced: dkk == null ? 1 : 0, ...(optional ? { optional } : {}),
  })
  const parts: CostPart[] = [
    { key: 'long', label: 'Long haul', paid: tickets.paid, estimated: tickets.quoted, unpriced: 0 },
    ofLegs('regional', 'Regional flights', (l) => l.fam === 'flight'),
    ofLegs('ground', 'Ground', (l) => l.fam !== 'flight'),
    { key: 'stays', label: 'Stays', paid: t.stays_booked_dkk, estimated: t.stays_planned_dkk, unpriced: t.stays_unknown },
    ...(t.hub_nights > 0 ? [fee('hub', 'Hub stays', t.hub_stay_dkk)] : []),
    fee('cabin', 'Cabin bags', t.cabin_bag_dkk),
    fee('checked', 'Checked bags', t.checked_bag_dkk, true),
  ]
  return parts.filter((p) => p.paid + p.estimated > 0 || p.unpriced > 0)
}

/** What the trip costs, the optional parts left out. */
export function tripCost(parts: CostPart[]): { total: number; paid: number; estimated: number; unpriced: number } {
  const ps = parts.filter((p) => !p.optional)
  const paid = ps.reduce((a, p) => a + p.paid, 0)
  const estimated = ps.reduce((a, p) => a + p.estimated, 0)
  return { total: paid + estimated, paid, estimated, unpriced: ps.reduce((a, p) => a + p.unpriced, 0) }
}

export interface CostItem { key: LegKey; fam: Family; label: string; dkk: number; paid: boolean }

/** The biggest things the trip pays for: the long-haul tickets as one, and every leg with a price. */
export function costItems(legs: LegState[], tickets: TicketSplit, name: (l: LegState) => string, n = 5): CostItem[] {
  const items: CostItem[] = []
  const long = tickets.paid + tickets.quoted
  if (long > 0) items.push({ key: 'in', fam: 'flight', label: 'Long haul', dkk: long, paid: tickets.quoted === 0 })
  for (const l of legs) if (typeof l.key === 'number' && l.price) items.push({ key: l.key, fam: l.fam, label: name(l), dkk: l.price, paid: l.paid })
  return items.sort((a, b) => b.dkk - a.dkk).slice(0, n)
}

/** The day after a stop's last night. The free nights after the last stop are not its own. */
export const stopEnd = (sp: ScheduledPlace) => addDays(sp.inDay, sp.days)

/**
 * Where you are on a day of the trip: the stop you sleep at that night with the nights left there, the free
 * nights, or null on the move. next is the first leg that leaves that day or later. Nothing before the way in
 * leaves or after the way home lands.
 */
export function nowIn(sched: Schedule, legs: LegState[], ends: { start: string; end: string }, today: string): { at: number | 'free' | null; nightsLeft: number; next: LegKey | null } | null {
  if (today < ends.start || today > ends.end) return null
  const next = legs.find((l) => l.day >= today)?.key ?? null
  const i = sched.places.findIndex((sp) => sp.days > 0 && sp.inDay <= today && today < stopEnd(sp))
  if (i >= 0) return { at: i, nightsLeft: dayDiff(today, stopEnd(sched.places[i])), next }
  const last = sched.places[sched.places.length - 1]
  const home = sched.homeDepart.slice(0, 10)
  if (last && sched.free > 0 && today >= stopEnd(last) && today < home) return { at: 'free', nightsLeft: dayDiff(today, home), next }
  return { at: null, nightsLeft: 0, next }
}

/** The id of a leg's row in the story, so the status can take you to it. */
export const legId = (key: LegKey) => `lg-${key}`

/** The stops that booked legs hold on both sides, by place index. Their nights cannot move. */
export function heldStops(legs: LegState[], places: number): Set<number> {
  const at = new Map(legs.map((l) => [l.key, l]))
  const held = new Set<number>()
  for (let i = 0; i < places; i++) {
    const inn = at.get(i === 0 ? 'in' : i)
    const out = at.get(i === places - 1 ? 'home' : i + 1)
    if (inn?.booked && out?.booked) held.add(i)
  }
  return held
}
