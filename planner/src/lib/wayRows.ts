import type { InOut, StopItem, Way } from '../data/types'
import { clock, hours, kr, weekdayDay } from './format'
import { feeMark, LONG_WAIT_H, nightMark, type Mark } from './marks'
import { priceOfWays } from './options'
import { chooseWay, dayOf, endOf, waysOn, type WayChoice } from './ways'
import { nights } from './waytrack'

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

/**
 * What kind of ticket the way of a row is, in words. A ticket whose other half moves the trip's other end to
 * another city is an open jaw ticket, a ticket without its other half is just a ticket.
 */
export function kindOf(inout: InOut, { way, keepsCity }: Pick<WayRow, 'way' | 'keepsCity'>): string {
  if (way.type === 'ticket') return !way.paired_with || !inout.ways[way.paired_with] ? 'Ticket' : keepsCity ? 'Return ticket' : 'Open jaw ticket'
  if (way.type === 'madrid') return 'Via Madrid, 2 tickets'
  return way.tickets.length > 1 ? `${way.tickets.length} one way tickets` : 'One way'
}

/** An airport on the way with the wait there, a night stop as its nights, and the mark of what kind of stop it is. */
export interface StopMark { code: string; text: string | null; mark: Mark | null }

/** The marks of a way row: on its stops, on the times it leaves and lands, and on the row itself. */
export interface WayMarks {
  stops: StopMark[]
  leaves: Mark | null
  lands: Mark | null
  /** what the pick does to the other direction first, then the bags and the United States */
  badges: Mark[]
  /** why picking it changes nothing, for the Pick it greys out */
  dead: string | null
}

/** The airports in between with the wait at each, a night, a day stop, a self transfer or a long wait marked on the stop. */
export function wayStops(way: Way, name: (code: string) => string): StopMark[] {
  const wait = (code: string, h: number | null, night?: boolean): Mark | null =>
    h == null || h < LONG_WAIT_H ? null : night ? { kind: 'night', label: `A night in ${name(code)}, ${hours(h)}` } : { kind: 'wait', label: `Long wait in ${name(code)}, ${hours(h)}`, tone: 'part' }
  return way.timeline.flatMap((t): StopMark[] => {
    if (t.kind === 'flight') return t.connections.map((c) => ({ code: c.airport, text: c.layover_h != null ? hours(c.layover_h) : null, mark: wait(c.airport, c.layover_h, t.overnight_layover) }))
    const s = t as StopItem
    const at = name(s.airport)
    if (s.kind === 'night') {
      const stay = s.stay_estimate_dkk ? `, stay about ${kr(s.stay_estimate_dkk)}` : ''
      return [{ code: s.airport, text: nights(s.nights), mark: { kind: 'night', label: `${nights(s.nights)} in ${at}${stay}` } }]
    }
    if (s.kind === 'day_stop') return [{ code: s.airport, text: hours(s.hours), mark: { kind: 'day', label: `A day in ${at}, ${hours(s.hours)}` } }]
    if (s.kind === 'self_transfer') return [{ code: s.airport, text: hours(s.hours), mark: { kind: 'self', label: `Self transfer in ${at}, you check in again`, tone: 'part' } }]
    return [{ code: s.airport, text: hours(s.hours), mark: wait(s.airport, s.hours) }]
  })
}

/**
 * What the pick does to the other direction, as a chip with only what changes on it: the city it then
 * leaves from or lands in, the day, or the time. Nothing when it stays as it is. `other` is the way the
 * trip has in the other direction.
 */
export function otherMark(r: WayRow, dir: 'in' | 'home', other: Way, name: (code: string) => string): Mark | null {
  const then = dir === 'in' ? r.choice.wayHome : r.choice.wayIn
  if (!r.works || then.id === other.id) return null
  const word = dir === 'in' ? 'Way home' : 'Way in'
  const kind = dir === 'in' ? 'home' : 'in'
  const when = `${weekdayDay(then.depart)} at ${clock(then.depart)}`
  const oneWay = then.type === 'oneways' && other.type !== 'oneways'
  const also = oneWay ? ', as a one way' : ''
  const tone = !r.keeps || !r.keepsCity ? 'strong' : undefined
  if (!r.keepsCity) {
    const code = dir === 'in' ? then.from : then.to
    const label = dir === 'in' ? `${word} leaves from ${name(code)}, ${when}` : `${word} lands in ${name(code)}, leaves ${when}`
    return { kind, label: label + also, text: `${code} ${weekdayDay(then.depart)}`, tone }
  }
  if (!r.keeps) return { kind, label: `${word} moves to ${when}${also}`, text: `${weekdayDay(then.depart)} ${clock(then.depart)}`, tone }
  if (then.depart !== other.depart) return { kind, label: `${word} still ${weekdayDay(then.depart)}, now at ${clock(then.depart)}${also}`, text: clock(then.depart) }
  return oneWay ? { kind, label: `${word} still ${when}${also}`, text: 'One way' } : null
}

/** The marks of a row. `other` is the way the trip has in the other direction, `name` turns an airport into a place. */
export function wayMarks(inout: InOut, r: WayRow, dir: 'in' | 'home', other: Way, name: (code: string) => string): WayMarks {
  const w = r.way
  const badges: Mark[] = []
  const moved = otherMark(r, dir, other, name)
  if (moved) badges.push(moved)
  // the bags of the way's own tickets, known only when every ticket is
  if (w.tickets.length && w.tickets.every((t) => inout.tickets[t])) {
    const { cabin, checked } = priceOfWays(inout, [w])
    for (const m of [feeMark('cabin', cabin), feeMark('checked', checked)]) if (m) badges.push(m)
  }
  if (w.us_transit) badges.push({ kind: 'esta', label: 'Through the United States, ESTA needed', text: 'ESTA' })
  return {
    stops: wayStops(w, name),
    leaves: nightMark(w.depart, 'leaves'),
    lands: nightMark(w.arrive, 'lands'),
    badges,
    dead: r.works ? null : r.choice.note ?? 'Picking it changes nothing',
  }
}
