import type { InOut, Way } from '../data/types'
import { priceOfWays } from './options'
import { chooseWay, dayOf, waysOn, type WayChoice } from './ways'

// The rows of the way sheet and the prices of the day picker on the way in and the way home. A ticket
// way carries no price of its own, its ticket does, so a row is priced as what the way in and the way
// home cost together once it is picked. That is the long haul figure of the trip, and it puts a one way
// and a return ticket on the same footing.

export interface WayRow {
  way: Way
  /** the way in and way home this row gives, and what else changed */
  choice: WayChoice
  /** what both ways cost with this pick, or null when no price is known */
  total: number | null
  /** the other direction stays on its day */
  keeps: boolean
  /** picking it changes the trip, or it is the way the trip has */
  works: boolean
}

/** What a way in and a way home cost together: each ticket once, and a way without a known ticket at its own price. */
export function pairPrice(inout: InOut, wayIn: Way, wayHome: Way): number | null {
  const ways = [wayIn, wayHome]
  const ticketed = (w: Way) => w.tickets.length > 0 && w.tickets.every((t) => inout.tickets[t])
  const sum = priceOfWays(inout, ways.filter(ticketed)).price_dkk + ways.filter((w) => !ticketed(w)).reduce((s, w) => s + w.price_dkk, 0)
  return sum > 0 ? sum : null
}

/**
 * The ways of each day between the same two cities as `like`, the way the trip has now. Ways that change
 * nothing go last, then the same kind first as waysOn has them, then those that leave the other direction on
 * its day, then the cheapest for both ways.
 */
export function wayRowsByDay(inout: InOut, like: Way, current: { wayIn: Way; wayHome: Way }): Record<string, WayRow[]> {
  const otherOf = (c: { wayIn: Way; wayHome: Way }) => (like.direction === 'in' ? c.wayHome : c.wayIn)
  const out: Record<string, WayRow[]> = {}
  for (const [d, list] of Object.entries(waysOn(inout, like))) {
    const rows = list.map((way): WayRow => {
      const choice = chooseWay(inout, way, current)
      const moved = choice.wayIn.id !== current.wayIn.id || choice.wayHome.id !== current.wayHome.id
      return {
        way,
        choice,
        total: pairPrice(inout, choice.wayIn, choice.wayHome),
        keeps: dayOf(otherOf(choice)) === dayOf(otherOf(current)),
        works: moved || way.id === like.id,
      }
    })
    const kind = (r: WayRow) => (r.way.type === like.type ? 0 : 1)
    rows.sort((a, b) =>
      Number(!a.works) - Number(!b.works) || kind(a) - kind(b) || Number(!a.keeps) - Number(!b.keeps) ||
      (a.total ?? Infinity) - (b.total ?? Infinity))
    out[d] = rows
  }
  return out
}

/** The price of each day's first row, the shape WhenPicker takes. A day whose first row has no price has none. */
export function rowFares(rows: Record<string, WayRow[]>): Record<string, number> {
  const fares: Record<string, number> = {}
  for (const [d, list] of Object.entries(rows)) if (list[0]?.works && list[0].total != null) fares[d] = list[0].total
  return fares
}
