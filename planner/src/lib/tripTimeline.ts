import { dayDiff } from './format'
import { addDays } from './time'

// A trip as a bar of its nights: a segment per country as wide as the nights spent there, on one axis
// shared by every trip shown, so the same stretch of December lines up from row to row. The nights no
// stop holds before the flight home are a segment of their own, so a spare day is never silent.

export interface LineInput {
  /** the schedule's stops: where, the day you get there and the nights you sleep there */
  places: { node: string; inDay: string; days: number }[]
  /** how you reach each stop, null for the first */
  modes: (string | null)[]
  /** the nights before the flight home that no stop holds */
  free: number
  firstDay: string
  homeDepart: string
  countryOf: (node: string) => string
  nameOf: (node: string) => string
}

export interface Seg {
  country: string
  /** the first night, "2026-12-02" */
  from: string
  nights: number
  /** the stops in it, in order, a stop passed through included */
  stops: string[]
  /** the free nights before the flight home */
  free: boolean
}

export interface Line {
  /** the landing day and the day of the flight home */
  start: string
  end: string
  segs: Seg[]
  /** the days a flight brings you into a stop */
  flights: string[]
}

export function timeline(t: LineInput): Line {
  const segs: Seg[] = []
  const flights: string[] = []
  t.places.forEach((p, i) => {
    const country = t.countryOf(p.node)
    const name = t.nameOf(p.node)
    if (i > 0 && t.modes[i] === 'flight') flights.push(p.inDay.slice(0, 10))
    const last = segs[segs.length - 1]
    if (last && last.country === country) {
      last.nights += p.days
      last.stops.push(name)
    } else segs.push({ country, from: p.inDay.slice(0, 10), nights: p.days, stops: [name], free: false })
  })
  const end = t.places[t.places.length - 1]
  if (end && t.free > 0) {
    segs.push({ country: t.countryOf(end.node), from: addDays(end.inDay.slice(0, 10), end.days), nights: t.free, stops: [], free: true })
  }
  return { start: t.firstDay.slice(0, 10), end: t.homeDepart.slice(0, 10), segs, flights }
}

export interface Axis {
  start: string
  end: string
  days: number
}

/** The span of every line, from the earliest landing to the latest flight home. */
export function axisOf(lines: readonly { start: string; end: string }[]): Axis {
  if (!lines.length) return { start: '2026-12-01', end: '2026-12-02', days: 1 }
  const start = lines.reduce((m, l) => (l.start < m ? l.start : m), lines[0].start)
  const end = lines.reduce((m, l) => (l.end > m ? l.end : m), lines[0].end)
  return { start, end, days: Math.max(1, dayDiff(start, end)) }
}

/** Where a day sits on the axis, 0 at its start and 1 at its end. */
export const at = (a: Axis, d: string) => dayDiff(a.start, d) / a.days

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** The first of each month after the axis starts and before it ends. */
export function monthTicks(a: Axis): { day: string; label: string; x: number }[] {
  const out: { day: string; label: string; x: number }[] = []
  let y = +a.start.slice(0, 4)
  let m = +a.start.slice(5, 7)
  while (true) {
    m += 1
    if (m > 12) { m = 1; y += 1 }
    const d = `${y}-${String(m).padStart(2, '0')}-01`
    if (d >= a.end) break
    out.push({ day: d, label: MON[m - 1], x: at(a, d) })
  }
  return out
}
