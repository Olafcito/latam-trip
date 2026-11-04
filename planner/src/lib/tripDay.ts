import type { Family } from '@map/data/types'
import { clock, nextDayMark } from './format'

// One day of the trip across every leg and stop: what leaves and lands, where you check out and in, the
// booked activities and where you sleep. The day view under a sheet's strip shows it, and the strip of a held
// leg marks its other days from it. Pure, so the sheet and the tests read the same list.

/** A leg of the trip, in place names, with its local times. A date alone has no time. */
export interface DayLeg {
  key: string
  fam: Family
  from: string
  to: string
  depart: string
  arrive: string | null
  booked: boolean
}

/** A stop: its nights run from inDay to the night before outDay. */
export interface DayStop {
  name: string
  inDay: string
  outDay: string
  /** the booked stay there, by name when it has one */
  stay?: { name: string | null; booked: boolean }
}

export interface DayInput {
  legs: DayLeg[]
  stops: DayStop[]
  /** booked activities, with a local time or a day */
  others: { title: string; at: string }[]
}

export type DayKind = Family | 'out' | 'in' | 'night' | 'other'

export interface DayItem {
  kind: DayKind
  key: string
  /** "06:00", or null for a day without a time */
  time: string | null
  title: string
  /** the place of a stay named by its hostel, else nothing */
  detail?: string | null
  booked: boolean
  /** Check in, Check out, or Lands for a leg that left the day before */
  tag?: string
  /** a leg's landing time, null when not known */
  until?: string | null
  /** "+1" when a leg lands on a later day */
  mark?: string
  /** the key of the leg */
  leg?: string
}

const timeOf = (t: string | null) => (t && t.length >= 16 ? clock(t) : null)

/** check out comes first, the legs and activities by their time, then check in, the night last */
const RANK: Record<DayKind, number> = { out: 0, flight: 1, boat: 1, ground: 1, other: 1, in: 2, night: 3 }

/** Everything on one day of the trip, in the order it happens. */
export function tripDay(input: DayInput, day: string): DayItem[] {
  const items: DayItem[] = []
  for (const l of input.legs) {
    const leaves = l.depart.slice(0, 10)
    const lands = l.arrive?.slice(0, 10) ?? leaves
    if (leaves === day) {
      items.push({
        kind: l.fam, key: `leg-${l.key}`, time: timeOf(l.depart), until: timeOf(l.arrive), mark: l.arrive && l.depart.length >= 16 ? nextDayMark(l.depart, l.arrive) : '',
        title: `${l.from} to ${l.to}`, booked: l.booked, leg: l.key,
      })
    } else if (lands === day && leaves < day) {
      items.push({ kind: l.fam, key: `land-${l.key}`, time: timeOf(l.arrive), title: `${l.from} to ${l.to}`, tag: 'Lands', booked: l.booked, leg: l.key })
    }
  }
  for (const s of input.stops) {
    if (s.inDay >= s.outDay) continue
    const named = s.stay?.name ?? null
    const booked = !!s.stay?.booked
    const title = named ?? s.name
    const detail = named ? s.name : undefined
    const base = (kind: DayKind, tag?: string): DayItem => {
      const it: DayItem = { kind, key: `${kind}-${s.name}`, time: null, title, booked }
      if (detail) it.detail = detail
      if (tag) it.tag = tag
      return it
    }
    if (day === s.outDay) items.push(base('out', 'Check out'))
    if (day === s.inDay) items.push(base('in', 'Check in'))
    if (day >= s.inDay && day < s.outDay) items.push(base('night'))
  }
  input.others.forEach((o, k) => {
    if (o.at.slice(0, 10) === day) items.push({ kind: 'other', key: `other-${k}`, time: timeOf(o.at), title: o.title, booked: true })
  })
  return items
    .map((it, k) => ({ it, k }))
    .sort((a, b) => RANK[a.it.kind] - RANK[b.it.kind] || (a.it.time ?? '99').localeCompare(b.it.time ?? '99') || a.k - b.k)
    .map(({ it }) => it)
}

export type DayValue =
  | { kind: 'fare'; price: number; low: boolean }
  | { kind: 'booked' }
  | { kind: 'none' }

/** What a day of the strip shows under its date: a check on the booked day, else the cheapest fare. A booked day never shows a price. */
export function dayValue(day: string, o: { fares: Record<string, number>; booked: string | null }): DayValue {
  if (o.booked && day === o.booked) return { kind: 'booked' }
  const p = o.fares[day]
  if (p == null) return { kind: 'none' }
  const known = Object.values(o.fares)
  return { kind: 'fare', price: p, low: known.length > 1 && p === Math.min(...known) }
}
