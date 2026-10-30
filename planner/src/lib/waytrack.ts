import type { Airport, FlightItem, StopKind, Way } from '../data/types'
import { clock, day, dayDiff, hours } from './format'

// A long-haul way as a transit line: the flights as stretches, every wait between them as a stop.
// Times are local at each airport, as in the data. A ticket with changes only knows its first
// take-off, its last landing and how long each change is, so its flights are shared out by the
// distance each one covers to place the changes on the line, and no clock time is made up for them.
// wayAxis lays the parts out to
// scale, by the hours each one takes from the first take-off, with a floor so a short hop still has
// room for its labels.

/** A stretch in the air. approx when it is a share of one ticket's flight split around its changes, so its length is only drawn. */
export interface TrackFly {
  kind: 'fly'
  hours: number
  approx: boolean
}

/** A wait between two flights. */
export interface TrackWait {
  kind: 'wait'
  code: string
  /** the stop between tickets as the data names it, or 'layover' for a change inside one ticket */
  type: StopKind | 'layover'
  hours: number | null
  nights: number
  /** a layover inside one ticket that runs over night */
  overnight: boolean
  /** local times from the data, for a stop between tickets. A change inside one ticket has none */
  arrive: string | null
  depart: string | null
  stay: number | null
}

export interface WayTrackModel {
  start: { code: string; time: string | null }
  end: { code: string; time: string | null }
  /** fly and wait in order, from the first take-off to the last landing */
  parts: (TrackFly | TrackWait)[]
}

/** km between two airports along the earth */
function km(a: Airport, b: Airport): number {
  const r = Math.PI / 180
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}

/**
 * The hours in the air of each flight on one ticket. With every airport known, each gets a share in
 * proportion to a rough block time for its distance, 800 km an hour plus half an hour on the ground.
 * Without, the shares are even.
 */
function shares(path: string[], air: number, airports: Record<string, Airport>): number[] {
  const legs = path.length - 1
  const ap = path.map((c) => airports[c])
  if (ap.some((a) => !a)) return Array(legs).fill(air / legs)
  const rough = ap.slice(1).map((b, i) => km(ap[i], b) / 800 + 0.5)
  const sum = rough.reduce((a, b) => a + b, 0)
  return rough.map((r) => (air * r) / sum)
}

/** The way's flights split around their changes, with the stops between tickets kept as they are. */
export function wayTrack(w: Way, airports: Record<string, Airport> = {}): WayTrackModel {
  const parts: (TrackFly | TrackWait)[] = []
  for (const it of w.timeline) {
    if (it.kind !== 'flight') {
      parts.push({
        kind: 'wait', code: it.airport, type: it.kind, hours: it.hours, nights: it.nights, overnight: it.kind === 'night',
        arrive: it.arrive || null, depart: it.depart || null, stay: it.stay_estimate_dkk,
      })
      continue
    }
    const f = it as FlightItem
    const legs = f.connections.length + 1
    const lay = f.connections.reduce((a, c) => a + (c.layover_h ?? 0), 0)
    const path = [f.from, ...f.connections.map((c) => c.airport), f.to]
    const each = legs === 1 ? [f.hours] : shares(path, Math.max(0.5 * legs, f.hours - lay), airports)
    f.connections.forEach((c, i) => {
      parts.push({ kind: 'fly', hours: each[i], approx: true })
      parts.push({
        kind: 'wait', code: c.airport, type: 'layover', hours: c.layover_h, nights: 0,
        overnight: f.overnight_layover && i === f.connections.length - 1, arrive: null, depart: null, stay: null,
      })
    })
    parts.push({ kind: 'fly', hours: each[legs - 1], approx: legs > 1 })
  }
  return { start: { code: w.from, time: w.depart || null }, end: { code: w.to, time: w.arrive || null }, parts }
}

/** A part on the axis: its hours from the take-off, and where it is drawn as shares of the line. */
export interface AxisPart { part: TrackFly | TrackWait; start: number; hours: number; left: number; width: number }
export interface WayAxis {
  parts: AxisPart[]
  total: number
  /** where an hour from the take-off falls on the line, 0 to 1 */
  x: (h: number) => number
}

/** the least share of the line a part gets, so a 1 hour change between two long flights can carry its code */
const FLOOR = 0.1

export function wayAxis(t: WayTrackModel): WayAxis {
  let at = 0
  const raw = t.parts.map((part) => {
    const h = Math.max(0, part.hours ?? 1)
    const out = { part, start: at, hours: h }
    at += h
    return out
  })
  const total = at
  const floor = Math.min(FLOOR, 0.5 / Math.max(1, raw.length))
  const weight = raw.map((p) => Math.max(p.hours, total * floor))
  const sum = weight.reduce((a, b) => a + b, 0) || 1
  let left = 0
  const parts = raw.map((p, i) => {
    const out = { ...p, left, width: weight[i] / sum }
    left += out.width
    return out
  })
  const x = (h: number) => {
    const p = parts.find((q) => h <= q.start + q.hours) ?? parts[parts.length - 1]
    if (!p) return 0
    return p.left + (p.hours > 0 ? Math.min(1, Math.max(0, (h - p.start) / p.hours)) : 0) * p.width
  }
  return { parts, total, x }
}

/** "1 night", "2 nights". */
export const nights = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`

/**
 * What the track says, read out once: "Copenhagen 06:10 2 Dec to Madrid 09:35, night in Madrid,
 * Madrid 08:10 3 Dec to San Salvador 21:45, changing in Bogotá".
 */
export function wayTrackLabel(w: Way, airports: Record<string, Airport> = {}): string {
  const nm = (code: string) => airports[code]?.name ?? code
  const out: string[] = []
  for (const it of w.timeline) {
    if (it.kind === 'flight') {
      const f = it as FlightItem
      const land = f.arrive ? ` ${clock(f.arrive)}${f.depart && dayDiff(f.depart, f.arrive) > 0 ? ` ${day(f.arrive)}` : ''}` : ''
      const go = f.depart ? ` ${clock(f.depart)} ${day(f.depart)}` : ''
      const via = f.connections.length ? `, changing in ${f.connections.map((c) => nm(c.airport)).join(' and ')}` : ''
      out.push(`${nm(f.from)}${go} to ${nm(f.to)}${land}${via}`)
    } else if (it.kind === 'night') {
      out.push(`${it.nights === 1 ? 'night' : nights(it.nights)} in ${nm(it.airport)}`)
    } else if (it.kind === 'day_stop') {
      out.push(`a day in ${nm(it.airport)}, ${hours(it.hours)}`)
    } else if (it.kind === 'self_transfer') {
      out.push(`self-transfer in ${nm(it.airport)}, ${hours(it.hours)}`)
    } else {
      out.push(`change in ${nm(it.airport)}, ${hours(it.hours)}`)
    }
  }
  return out.join(', ')
}
