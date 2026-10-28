import type { Model } from './model'
import type { Connection, Mode, RouteOption } from './types'

// Saved trips live in this browser only. A trip is an ordered list of legs, each leg one
// option (by mode) on one connection, travelled from one end to the other.

export interface TripLeg {
  cid: string
  from: string
  to: string
  mode: Mode
}

/** A flight in a long-haul way's timeline, connections inside the ticket included. Times are local. */
export interface WayFlight {
  kind: 'flight'
  from: string
  to: string
  depart: string | null
  arrive: string | null
  hours: number | null
  connections?: { airport: string; layover_h: number | null }[]
  carriers?: string[]
  flight_numbers?: string[]
}

/** Time on the ground between two flights of a way. */
export interface WayStop {
  kind: 'connection' | 'self_transfer' | 'day_stop' | 'night'
  airport: string
  arrive: string | null
  depart: string | null
  hours: number | null
  nights?: number
}

export type WayItem = WayFlight | WayStop

/** Fees kept apart from the ticket price. */
export interface WayExtras {
  cabin_bag_fees_dkk: number | null
}

/** A long-haul way (Copenhagen to Latin America or back) as written in data/inout.json. */
export interface SeedWay {
  id?: string
  type?: string
  from: string
  to: string
  depart: string | null
  arrive: string | null
  flying_hours: number | null
  total_hours: number | null
  hub_nights: number
  us_transit: boolean
  airports: string[]
  // the way's own tickets; a ticket shared with the other way is priced on the in/out instead
  price_dkk?: number
  extras?: WayExtras
  shared_ticket?: string | null
  timeline: WayItem[]
}

/** In and out of a trip that started from a ranked scenario (data/saved_trips.json). */
export interface SeedInout {
  option_id: string
  type: string
  entry: string
  exit: string
  price_dkk: number
  extras?: WayExtras
  way_in: SeedWay
  way_home: SeedWay
}

/** A stretch of a seeded trip in travel order: an overland block (your own route) or a priced flight. */
export interface SeedSegment {
  kind: 'overland' | 'flight'
  from: string
  to: string
  note?: string
  countries?: string[]
  cid?: string | null
  depart?: string | null
  arrive?: string | null
  price_dkk?: number | null
  cabin_bag_fee_dkk?: number | null
  carriers?: string[]
  via?: string[]
  price_seen_for?: string
}

export interface SeedTotals {
  long_haul_dkk: number
  in_between_dkk: number
  flights_total_dkk: number
  cabin_bag_fees_dkk: number
  hub_nights: number
  us_transit: boolean
}

export interface Trip {
  id: string
  name: string
  legs: TripLeg[]
  updated: number
  /** Where the trip begins before any leg, e.g. the planner's way-in city. */
  start?: string
  // set on trips that came from data/saved_trips.json
  seed?: boolean
  rank?: number
  inout?: SeedInout
  segments?: SeedSegment[]
  totals?: SeedTotals
}

export interface TripState {
  trips: Trip[]
  active: string | null // the trip drawn on the map and added to, if any
}

const TRIPS_KEY = 'latam-trip.trips'
const SEEDED_KEY = 'latam-trip.seeded'
const OLD_JOURNEY_KEY = 'latam-trip.journey'

export const EMPTY_TRIPS: TripState = { trips: [], active: null }

/** Card colours, by position in the list. */
export const TRIP_COLORS = ['#F2B544', '#6FD3B8', '#8DB8F2', '#E99AC0', '#C6A4F2']

const isLeg = (x: unknown): x is TripLeg =>
  !!x && typeof x === 'object' && ['cid', 'from', 'to', 'mode'].every((k) => typeof (x as Record<string, unknown>)[k] === 'string')

/** The optional seed fields of a stored or seeded trip, kept only when they have the right shape. */
function seedFields(t: Trip): Partial<Trip> {
  const out: Partial<Trip> = {}
  if (t.seed === true) out.seed = true
  if (typeof t.rank === 'number') out.rank = t.rank
  if (t.inout && typeof t.inout === 'object' && typeof t.inout.entry === 'string' && typeof t.inout.exit === 'string') out.inout = t.inout
  if (Array.isArray(t.segments)) out.segments = t.segments.filter((g) => g && typeof g.from === 'string' && typeof g.to === 'string')
  if (t.totals && typeof t.totals === 'object') out.totals = t.totals
  return out
}

/** Parse stored trips, dropping anything malformed. */
export function parseTrips(raw: unknown): TripState {
  if (!raw || typeof raw !== 'object') return EMPTY_TRIPS
  const r = raw as { trips?: unknown; active?: unknown }
  const trips = (Array.isArray(r.trips) ? r.trips : [])
    .filter((t): t is Trip => !!t && typeof t === 'object' && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t) => ({
      ...seedFields(t),
      id: t.id,
      name: t.name,
      legs: Array.isArray(t.legs) ? t.legs.filter(isLeg) : [],
      updated: Number(t.updated) || 0,
    }))
  const active = typeof r.active === 'string' && trips.some((t) => t.id === r.active) ? r.active : null
  return { trips, active }
}

/**
 * The first journey list stored `${connectionId}|${mode}` keys with no direction. Read each
 * leg from where the last one ended when it can, otherwise from the connection's first end.
 */
export function fromOldJourney(keys: string[]): Trip | null {
  const legs: TripLeg[] = []
  for (const k of keys) {
    const [cid, mode] = k.split('|')
    const ends = cid?.split('-')
    if (!mode || ends?.length !== 2) continue
    const prev = legs.at(-1)?.to
    const from = prev && ends.includes(prev) ? prev : ends[0]
    legs.push({ cid, from, to: from === ends[0] ? ends[1] : ends[0], mode: mode as Mode })
  }
  return legs.length ? { id: newId(), name: 'My journey', legs, updated: Date.now() } : null
}

export function readTrips(): TripState {
  try {
    const raw = localStorage.getItem(TRIPS_KEY)
    if (raw) return parseTrips(JSON.parse(raw))
    const old = localStorage.getItem(OLD_JOURNEY_KEY)
    const parsed: unknown = old ? JSON.parse(old) : []
    const trip = Array.isArray(parsed) ? fromOldJourney(parsed.filter((x): x is string => typeof x === 'string')) : null
    return trip ? { trips: [trip], active: null } : EMPTY_TRIPS
  } catch {
    return EMPTY_TRIPS
  }
}

export function writeTrips(state: TripState) {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(state))
    localStorage.removeItem(OLD_JOURNEY_KEY)
  } catch {
    // storage blocked: trips still work for this session
  }
}

const newId = () => Math.random().toString(36).slice(2, 10)

// ---- seeded trips (data/saved_trips.json) ----------------------------------------------------

/** Turn the trips of data/saved_trips.json into Trip objects. */
export function parseSeedFile(raw: unknown): Trip[] {
  const list = raw && typeof raw === 'object' && Array.isArray((raw as { trips?: unknown }).trips) ? (raw as { trips: unknown[] }).trips : []
  return parseTrips({ trips: list.map((t) => ({ ...(t as object), seed: true, updated: 0 })) }).trips
}

/**
 * Add seeded trips that this browser has not imported before. A seed the user deleted stays
 * deleted, because its id is remembered in `imported`. Seeds already in the list are refreshed.
 */
export function mergeSeeds(s: TripState, seeds: Trip[], imported: string[]): { state: TripState; imported: string[] } {
  const byId = new Map(seeds.map((t) => [t.id, t]))
  // a seed already in the list takes the file's newer in/out, segments and totals, and keeps the user's name and legs
  let changed = false
  const trips = s.trips.map((t) => {
    const f = t.seed ? byId.get(t.id) : undefined
    if (!f) return t
    const next = { ...t, rank: f.rank, inout: f.inout, segments: f.segments, totals: f.totals }
    if (JSON.stringify(next) === JSON.stringify(t)) return t
    changed = true
    return next
  })
  const have = new Set(s.trips.map((t) => t.id))
  const fresh = seeds.filter((t) => !have.has(t.id) && !imported.includes(t.id))
  if (!fresh.length) return { state: changed ? { ...s, trips } : s, imported }
  return { state: { ...s, trips: [...trips, ...fresh] }, imported: [...imported, ...fresh.map((t) => t.id)] }
}

export function readSeeded(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(SEEDED_KEY) ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function writeSeeded(ids: string[]) {
  try {
    localStorage.setItem(SEEDED_KEY, JSON.stringify(ids))
  } catch {
    // storage blocked: seeds are offered again next time
  }
}

// ---- edits: pure, so the app can hand them to setState ------------------------------------

const touch = (s: TripState, id: string, f: (t: Trip) => Trip): TripState => ({
  ...s,
  trips: s.trips.map((t) => (t.id === id ? { ...f(t), updated: Date.now() } : t)),
})

/** Start a trip and make it the open one. An empty name becomes "Trip N". */
export function createTrip(s: TripState, name: string, id = newId()): TripState {
  const trip: Trip = { id, name: name.trim() || `Trip ${s.trips.length + 1}`, legs: [], updated: Date.now() }
  return { trips: [...s.trips, trip], active: id }
}

export function openTrip(s: TripState, id: string | null): TripState {
  return { ...s, active: id && s.trips.some((t) => t.id === id) ? id : null }
}

export function renameTrip(s: TripState, id: string, name: string): TripState {
  return name.trim() ? touch(s, id, (t) => ({ ...t, name: name.trim() })) : s
}

export function deleteTrip(s: TripState, id: string): TripState {
  return { trips: s.trips.filter((t) => t.id !== id), active: s.active === id ? null : s.active }
}

/** Add a leg to the open trip. */
export function addLeg(s: TripState, leg: TripLeg): TripState {
  return s.active ? touch(s, s.active, (t) => ({ ...t, legs: [...t.legs, leg] })) : s
}

export function removeLeg(s: TripState, id: string, index: number): TripState {
  return touch(s, id, (t) => ({ ...t, legs: t.legs.filter((_, i) => i !== index) }))
}

export const activeTrip = (s: TripState): Trip | null => s.trips.find((t) => t.id === s.active) ?? null

// ---- reading a trip against the data ---------------------------------------------------------

/** The option a leg was added with: the fastest of its mode on that connection. */
export function legOption(model: Model, leg: TripLeg): { conn: Connection; opt: RouteOption } | null {
  const conn = model.conns.get(leg.cid)
  const opt = conn?.options
    .filter((o) => o.mode === leg.mode)
    .sort((x, y) => (x.duration_min ?? 1e9) - (y.duration_min ?? 1e9))[0]
  return conn && opt ? { conn, opt } : null
}

/** Places in visiting order. A leg that does not start where the last one ended adds its start too. */
export function tripStops(trip: Trip): string[] {
  const out: string[] = trip.start ? [trip.start] : []
  for (const p of tripPieces(trip)) {
    if (out.at(-1) !== p.from) out.push(p.from)
    if (out.at(-1) !== p.to) out.push(p.to)
  }
  return out
}

/** What the map draws for a trip, in travel order: its legs, or an overland block of a seeded trip. */
export type Piece = { kind: 'leg'; from: string; to: string; leg: TripLeg } | { kind: 'overland'; from: string; to: string; note: string }

/**
 * A seeded trip follows its segments: overland blocks as they are, flights as long as their leg
 * is still in the trip. Legs the segments do not name come after, in their own order.
 */
export function tripPieces(trip: Trip): Piece[] {
  const used = new Set<number>()
  const out: Piece[] = []
  for (const g of trip.segments ?? []) {
    if (g.kind === 'overland') {
      out.push({ kind: 'overland', from: g.from, to: g.to, note: g.note ?? '' })
      continue
    }
    const i = trip.legs.findIndex((l, k) => !used.has(k) && l.from === g.from && l.to === g.to)
    if (i < 0) continue
    used.add(i)
    out.push({ kind: 'leg', from: g.from, to: g.to, leg: trip.legs[i] })
  }
  trip.legs.forEach((l, k) => {
    if (!used.has(k)) out.push({ kind: 'leg', from: l.from, to: l.to, leg: l })
  })
  return out
}

export const tripEnd = (trip: Trip): string | null => tripStops(trip).at(-1) ?? null

/** Time and cheapest price over all legs. `unknown` counts legs with a missing number. */
export function tripTotals(model: Model, trip: Trip) {
  let min = 0
  let dkk = 0
  let unknown = 0
  for (const l of trip.legs) {
    const o = legOption(model, l)?.opt
    if (o?.duration_min == null || o.price_dkk.min == null) unknown++
    min += o?.duration_min ?? 0
    dkk += o?.price_dkk.min ?? 0
  }
  return { legs: trip.legs.length, min, dkk, unknown }
}

/** Index of a leg in the trip with this connection, direction and mode, or -1. */
export function legIndex(trip: Trip, cid: string, from: string, mode: Mode): number {
  return trip.legs.findIndex((l) => l.cid === cid && l.from === from && l.mode === mode)
}
