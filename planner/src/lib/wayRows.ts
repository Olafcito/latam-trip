import type { InOut, StopItem, Way } from '../data/types'
import { clock, kr, weekdayDay } from './format'
import { priceOfWays } from './options'
import { chooseWay, dayOf, endOf, waysOn, type WayChoice } from './ways'

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
  /** the other direction lands in or leaves from the city the trip has there now */
  keepsCity: boolean
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
 * The ways of each day between the same two cities as `like`, the way the trip has now, of the trip `tripId`.
 * Ways that change nothing go last, then those that keep the city at the other end, then the same kind first
 * as waysOn has them, then those that leave the other direction on its day, then the cheapest for both ways.
 */
export function wayRowsByDay(inout: InOut, like: Way, current: { wayIn: Way; wayHome: Way }, tripId?: string): Record<string, WayRow[]> {
  const otherOf = (c: { wayIn: Way; wayHome: Way }) => (like.direction === 'in' ? c.wayHome : c.wayIn)
  const out: Record<string, WayRow[]> = {}
  for (const [d, list] of Object.entries(waysOn(inout, like, tripId))) {
    const rows = list.map((way): WayRow => {
      const choice = chooseWay(inout, way, current)
      const moved = choice.wayIn.id !== current.wayIn.id || choice.wayHome.id !== current.wayHome.id
      return {
        way,
        choice,
        total: pairPrice(inout, choice.wayIn, choice.wayHome),
        keeps: dayOf(otherOf(choice)) === dayOf(otherOf(current)),
        keepsCity: endOf(inout, otherOf(choice)) === endOf(inout, otherOf(current)),
        works: moved || way.id === like.id,
      }
    })
    const kind = (r: WayRow) => (r.way.type === like.type ? 0 : 1)
    rows.sort((a, b) =>
      Number(!a.works) - Number(!b.works) || Number(!a.keepsCity) - Number(!b.keepsCity) || kind(a) - kind(b) || Number(!a.keeps) - Number(!b.keeps) ||
      (a.total ?? Infinity) - (b.total ?? Infinity))
    out[d] = rows
  }
  return out
}

/** The row a tap on a day in the day picker takes: the first that changes the trip, so one that keeps the city at the other end when there is one. */
export function pickOfDay(list: readonly WayRow[]): WayRow | undefined {
  return list.find((r) => r.works)
}

/** The price of the row a tap on each day takes, the shape WhenPicker takes. A day whose row has no price has none. */
export function rowFares(rows: Record<string, WayRow[]>): Record<string, number> {
  const fares: Record<string, number> = {}
  for (const [d, list] of Object.entries(rows)) {
    const total = pickOfDay(list)?.total
    if (total != null) fares[d] = total
  }
  return fares
}

/** The day with the cheapest way that changes the trip, or null when no such way has a price. */
export function cheapestDay(rows: Record<string, WayRow[]>): string | null {
  let best: { day: string; total: number } | null = null
  for (const [day, list] of Object.entries(rows)) {
    for (const r of list) if (r.works && r.total != null && (!best || r.total < best.total)) best = { day, total: r.total }
  }
  return best?.day ?? null
}

/** A line under a row. `bad` when picking it changes nothing, `strong` when it moves the other direction to another day. */
export interface RowNote { text: string; bad?: boolean; strong?: boolean }

export const nightsText = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

/**
 * What kind of ticket the way of a row is, in words. A ticket whose other half moves the trip's other end to
 * another city is an open jaw ticket, a ticket without its other half is just a ticket.
 */
export function kindOf(inout: InOut, { way, keepsCity }: Pick<WayRow, 'way' | 'keepsCity'>): string {
  if (way.type === 'ticket') return !way.paired_with || !inout.ways[way.paired_with] ? 'Ticket' : keepsCity ? 'Return ticket' : 'Open jaw ticket'
  if (way.type === 'madrid') return 'Via Madrid, 2 tickets'
  return way.tickets.length > 1 ? `${way.tickets.length} one way tickets` : 'One way'
}

/** What the bags cost on the way's own tickets, or null when that is not known. */
function bagsOf(inout: InOut, way: Way): string | null {
  if (!way.tickets.length || !way.tickets.every((t) => inout.tickets[t])) return null
  const { cabin, checked } = priceOfWays(inout, [way])
  const parts = [
    cabin == null ? null : cabin === 0 ? 'Cabin bag included' : `Cabin bag ${kr(cabin)}`,
    checked == null ? null : checked === 0 ? 'checked bag included' : `checked bag ${kr(checked)}`,
  ].filter((x): x is string => !!x)
  if (!parts.length) return null
  const s = parts.join(', ')
  return s[0].toUpperCase() + s.slice(1)
}

/**
 * The lines under a row: what happens to the other direction, nights and self transfers on the way, the United
 * States, and the bags. `other` is the way the trip has in the other direction, `name` turns an airport into a place.
 */
export function rowNotes(inout: InOut, r: WayRow, dir: 'in' | 'home', other: Way, name: (code: string) => string): RowNote[] {
  const notes: RowNote[] = []
  const then = dir === 'in' ? r.choice.wayHome : r.choice.wayIn
  const word = dir === 'in' ? 'Way home' : 'Way in'
  if (!r.works) notes.push({ text: r.choice.note ?? 'Picking it changes nothing', bad: true })
  else if (then.id !== other.id) {
    const when = `${weekdayDay(then.depart)} at ${clock(then.depart)}`
    const oneWay = then.type === 'oneways' && other.type !== 'oneways' ? ', as a one way' : ''
    // the same day at another time says the day stays and the time is new
    const still = then.depart === other.depart ? `${word} still ${when}` : `${word} still ${weekdayDay(then.depart)}, now at ${clock(then.depart)}`
    // another city at the other end is said first and in bold, it brings a new stop
    const moved = dir === 'in' ? `${word} leaves from ${name(then.from)}, ${when}` : `${word} lands in ${name(then.to)}, leaves ${when}`
    const text = !r.keepsCity ? moved : r.keeps ? still : `${word} moves to ${when}`
    notes.push({ text: `${text}${oneWay}`, strong: !r.keeps || !r.keepsCity })
  }
  for (const t of r.way.timeline) {
    if (t.kind === 'night') {
      const s = t as StopItem
      notes.push({ text: `${nightsText(s.nights)} in ${name(s.airport)}${s.stay_estimate_dkk ? `, stay about ${kr(s.stay_estimate_dkk)}` : ''}` })
    }
    if (t.kind === 'self_transfer') notes.push({ text: `Self transfer in ${name(t.airport)}, you check in again` })
  }
  if (r.way.us_transit) notes.push({ text: 'Through the United States, ESTA needed' })
  const bags = bagsOf(inout, r.way)
  if (bags) notes.push({ text: bags })
  return notes
}
