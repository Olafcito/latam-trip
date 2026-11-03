import type { InOut, MapData, Way } from '../data/types'
import { dayDiff, weekdayDay } from './format'
import { nodeForAirport, type Journey, type Place } from './journey'
import { hopBetween } from './mapTrips'
import { isTripWayId } from './repoTrips'

/** The local day a way leaves, "2026-12-03". */
export function dayOf(w: Way): string {
  return w.depart.slice(0, 10)
}

/** The way a ticket way travels with. A trip's own ticket ways are paired with each other by withTripWays. */
function partnerOf(inout: InOut, w: Way): Way | undefined {
  return w.paired_with ? inout.ways[w.paired_with] : undefined
}

/**
 * Ways with the same direction and the same two cities as `like`. `like` itself is always there,
 * even when it is a trip's own way that the build does not have. The own ways of other trips are left out,
 * they are copies of built ways.
 */
function sameRoute(inout: InOut, like: Way): Way[] {
  const byId = new Map<string, Way>()
  for (const w of Object.values(inout.ways)) {
    if (w.direction !== like.direction || w.from !== like.from || w.to !== like.to) continue
    if (isTripWayId(w.id) && w.id !== like.id) continue
    byId.set(w.id, w)
  }
  byId.set(like.id, like)
  return [...byId.values()]
}

/** The same flight at the same price. A saved trip's way is a copy of a built way and has no link back to it. */
const lookalike = (a: Way, b: Way) =>
  a.depart === b.depart && a.arrive === b.arrive && a.from === b.from && a.to === b.to && a.price_dkk === b.price_dkk

/**
 * Ways between the same two cities as `like`, by day, each day with the same kind first and then the cheapest.
 * A way that is the same flight as `like` at the same price is left out, `like` stays.
 */
export function waysOn(inout: InOut, like: Way): Record<string, Way[]> {
  const days: Record<string, Way[]> = {}
  for (const w of sameRoute(inout, like)) if (w.id === like.id || !lookalike(w, like)) (days[dayOf(w)] ??= []).push(w)
  const kind = (w: Way) => (w.type === like.type ? 0 : 1)
  for (const list of Object.values(days)) list.sort((a, b) => kind(a) - kind(b) || a.price_dkk - b.price_dkk)
  return days
}

/** The price of the first way each day, the shape WhenPicker takes. */
export function dayFares(inout: InOut, like: Way): Record<string, number> {
  const fares: Record<string, number> = {}
  for (const [d, list] of Object.entries(waysOn(inout, like))) fares[d] = list[0].price_dkk
  return fares
}

export interface WayChoice {
  wayIn: Way
  wayHome: Way
  /** what else changed with the pick, in a plain sentence, or null when only the picked way changed */
  note: string | null
}

const label = (direction: Way['direction']) => (direction === 'in' ? 'way in' : 'way home')

function pair(picked: Way, other: Way): { wayIn: Way; wayHome: Way } {
  return picked.direction === 'in' ? { wayIn: picked, wayHome: other } : { wayIn: other, wayHome: picked }
}

/** The cheapest one way between the cities of `other` on its day, else on the nearest day that has one. */
function oneWayFor(inout: InOut, other: Way): Way | null {
  const day = dayOf(other)
  const ones = sameRoute(inout, other).filter((w) => w.type === 'oneways')
  ones.sort((a, b) => Math.abs(dayDiff(day, dayOf(a))) - Math.abs(dayDiff(day, dayOf(b))) || a.price_dkk - b.price_dkk)
  return ones[0] ?? null
}

/**
 * Pick a way and get the way in and way home that go with it. A ticket way brings its partner.
 * A one way next to half of a ticket turns that other half into a one way, so the pair can always be mixed.
 */
export function chooseWay(inout: InOut, picked: Way, current: { wayIn: Way; wayHome: Way }): WayChoice {
  const [same, other] = picked.direction === 'in' ? [current.wayIn, current.wayHome] : [current.wayHome, current.wayIn]
  const otherLabel = label(other.direction)
  if (picked.id === same.id) return { ...current, note: null }

  if (picked.type !== 'oneways') {
    const partner = partnerOf(inout, picked)
    if (!partner) return { ...current, note: `This ticket has no ${otherLabel} saved, so nothing changed` }
    return { ...pair(picked, partner), note: `One ticket. This also sets the ${otherLabel} on ${weekdayDay(partner.depart)}` }
  }

  if (other.type === 'oneways') return { ...pair(picked, other), note: null }

  const one = oneWayFor(inout, other)
  if (!one) return { ...current, note: `There is no saved one ${otherLabel} on any day, so the ticket stays as it was` }
  return { ...pair(picked, one), note: `Your ${otherLabel} is now a one way on ${weekdayDay(one.depart)}` }
}

/**
 * A trip on another way in and way home. A new arrival city comes in as the first stop, with a leg on to the
 * old first stop, and a new home city is added as the last stop. A city already at that end is not added again.
 * The option id is that of the option with these two ways, else null.
 */
export function withEnds(j: Journey, inout: InOut, map: MapData, wayIn: Way, wayHome: Way): Journey {
  const places: Place[] = [...j.places]
  const arrival = nodeForAirport(inout, wayIn.to)
  if (!places.length) places.push({ node: arrival, hop: null })
  else if (places[0].node !== arrival) {
    places[0] = { ...places[0], hop: hopBetween(map, arrival, places[0].node, null) }
    places.unshift({ node: arrival, hop: null })
  }
  const exit = nodeForAirport(inout, wayHome.from)
  const last = places[places.length - 1]
  if (last.node !== exit) places.push({ node: exit, hop: hopBetween(map, last.node, exit, null) })
  const option = inout.options.find((o) => o.way_in === wayIn.id && o.way_home === wayHome.id)
  return { ...j, wayIn: wayIn.id, wayHome: wayHome.id, optionId: option?.id ?? null, places }
}
