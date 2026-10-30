import type { MapData } from '../data/types'
import { legDay, type Hop, type ScheduledPlace } from './journey'
import { iataOf, pricesOn, type PairDates } from './prices'
import { familyOf } from './route'
import { dateRange } from './time'

// The days a leg can leave on, with the cheapest fare known for each. The route and the map pane both
// open the calendar from this.

export interface LegWindow {
  /** the day it leaves */
  date: string
  min: string
  max: string
  days: string[]
  /** the cheapest fare known for each day */
  fares: Record<string, number>
  fromCode: string | null
  toCode: string | null
  /** a flight that can be searched */
  codes: { from: string; to: string } | null
}

/** the cheapest fare known for a leg on each day of a window */
function faresFor(pd: PairDates | null, from: string | null, to: string | null, days: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  if (!pd || !from || !to) return out
  for (const d of days) {
    const q = pricesOn(pd, from, to, d)[0]
    if (q) out[d] = q.p
  }
  return out
}

/** The window of a leg, from the day you reach the stop it leaves until the flight home. */
export function legWindow(pd: PairDates | null, map: MapData, h: Hop, prev: ScheduledPlace, homeDay: string): LegWindow {
  const date = legDay(h, prev.outDay)
  const flight = familyOf(h.mode) === 'flight'
  const fromCode = iataOf(map, h.from)
  const toCode = iataOf(map, h.to)
  const min = prev.inDay
  const max = homeDay
  // the day of the leg stays in the window, also when the stay around it has moved away
  const days = dateRange(date < min ? date : min, date > max ? date : max)
  const fares = flight ? faresFor(pd, fromCode, toCode, days) : {}
  if (h.flight) fares[h.flight.depart.slice(0, 10)] ??= h.flight.price_dkk
  return { date, min, max, days, fares, fromCode, toCode, codes: flight && fromCode && toCode ? { from: fromCode, to: toCode } : null }
}
