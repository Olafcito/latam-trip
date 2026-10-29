import type { AppData, InOut, Mode, Way } from '../data/types'
import { nodeForAirport, nodeName, schedule, type Journey } from './journey'
import { toUtcMs } from './time'

// A trip laid out on absolute time, for the trip strip: the long-haul ends, one span per stay and
// one moment per hop. Times are UTC ms so trips in different time zones share one axis.

const DAY = 86400000
/** a stop the schedule gives no whole day still gets this share of a day inside its block */
const MIN_SHARE = 0.5

export interface StripStay { node: string; name: string; country: string; start: number; end: number; nights: number }
export interface StripHop { at: number; mode: Mode; night: boolean; selfTransfer: boolean; known: boolean }
/** a long-haul way: lands from 22 to 5 local time, or has a self transfer inside */
export interface StripEnd { night: boolean; selfTransfer: boolean }
export interface StripLayout {
  departHome: number      // way in leaves Europe, UTC ms
  land: number            // way in lands, UTC ms
  leave: number           // way home leaves, UTC ms
  backHome: number        // way home lands in Europe, UTC ms
  stays: StripStay[]
  hops: StripHop[]
  wayIn: StripEnd
  wayHome: StripEnd
}

function airportOf(inout: InOut, node: string) {
  return inout.airports[node] ?? Object.values(inout.airports).find((a) => a.map_node === node)
}

/** Local hour from 22 to 5. */
const atNight = (local: string) => {
  const h = Number(local.slice(11, 13))
  return h >= 22 || h <= 5
}

const wayEnd = (w: Way): StripEnd => ({
  night: atNight(w.arrive),
  selfTransfer: w.timeline.some((x) => x.kind === 'self_transfer' || (x.kind === 'flight' && x.self_transfer_inside)),
})

/**
 * Walks the scheduled places in order. A run of places from a known arrival to the next known
 * departure shares that span by the days the schedule gives each place, every place keeping at
 * least half a day, so stops with no dated flight still show. A span that runs backwards (a flight
 * that leaves before you arrive) gets no width, never a negative one. Null when a way is missing.
 */
export function stripLayout(data: AppData, j: Journey): StripLayout | null {
  const { inout, map } = data
  const wi = inout.ways[j.wayIn]
  const wh = inout.ways[j.wayHome]
  if (!wi || !wh || !j.places.length) return null
  const inOffset = airportOf(inout, wi.to)?.utc_offset ?? 0
  // a town with no airport keeps the clock of an airport in its country, else the landing's clock
  const offset = (node: string) => {
    const a = airportOf(inout, node)
    if (a) return a.utc_offset
    const country = map.nodes.find((n) => n.id === node)?.country
    return Object.values(inout.airports).find((x) => x.country === country && !x.home)?.utc_offset ?? inOffset
  }
  const at = (local: string, node: string) => (local ? toUtcMs(local, offset(node)) : NaN)

  const land = at(wi.arrive, wi.to)
  const leave = at(wh.depart, wh.from)
  if (!Number.isFinite(land) || !Number.isFinite(leave)) return null
  const departHome = Math.min(land, at(wi.depart, wi.from) || land)
  const backHome = Math.max(leave, at(wh.arrive, wh.to) || leave)

  const names = (n: string) => nodeName(map, inout, n)
  const sched = schedule(j, wi, wh, nodeForAirport(inout, wh.from), names)
  const last = sched.places.length - 1
  const arrive = sched.places.map((p, k) => (k === 0 ? land : p.arrive ? at(p.arrive, p.node) : null))
  const depart = sched.places.map((p, k) => (k === last ? leave : p.depart ? at(p.depart, p.node) : null))

  const stays: StripStay[] = sched.places.map((p) => ({
    node: p.node,
    name: names(p.node),
    country: map.nodes.find((n) => n.id === p.node)?.country ?? airportOf(inout, p.node)?.country ?? '?',
    start: 0,
    end: 0,
    nights: p.days,
  }))

  let cursor = land
  let first = 0
  sched.places.forEach((_, k) => {
    const d = depart[k]
    if (d == null) return
    // places first..k sit between a known arrival and this known departure
    const start = Math.max(arrive[first] ?? cursor, cursor)
    const span = Math.max(0, d - start)
    const weights = stays.slice(first, k + 1).map((s) => Math.max(s.nights, MIN_SHARE))
    const total = weights.reduce((a, w) => a + w, 0)
    let t = start
    weights.forEach((w, i) => {
      const s = stays[first + i]
      s.start = t
      t = i === weights.length - 1 ? start + span : t + (span * w) / total
      s.end = t
    })
    cursor = start + span
    first = k + 1
  })

  const hops: StripHop[] = j.places.slice(1).map((p, i) => {
    const h = p.hop
    const f = h?.flight ?? null
    const mode: Mode = h?.mode ?? 'bus'
    return {
      at: (stays[i].end + stays[i + 1].start) / 2,
      mode,
      night: !!f && atNight(f.arrive),
      selfTransfer: !!(f as { self_transfer?: boolean } | null)?.self_transfer,
      known: mode === 'flight' ? !!f : h?.hours != null || h?.price_dkk != null,
    }
  })

  return { departHome, land, leave, backHome, stays, hops, wayIn: wayEnd(wi), wayHome: wayEnd(wh) }
}

/** The shared time axis for some trips: the earliest landing to the latest flight home, padded each side. */
export function stripDomain(layouts: StripLayout[], padDays = 2): [number, number] {
  if (!layouts.length) return [0, DAY]
  const pad = padDays * DAY
  return [Math.min(...layouts.map((l) => l.land)) - pad, Math.max(...layouts.map((l) => l.leave)) + pad]
}
