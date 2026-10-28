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

export interface Trip {
  id: string
  name: string
  legs: TripLeg[]
  updated: number
}

export interface TripState {
  trips: Trip[]
  active: string | null // the trip drawn on the map and added to, if any
}

const TRIPS_KEY = 'latam-trip.trips'
const OLD_JOURNEY_KEY = 'latam-trip.journey'

export const EMPTY_TRIPS: TripState = { trips: [], active: null }

/** Card colours, by position in the list. */
export const TRIP_COLORS = ['#F2B544', '#6FD3B8', '#8DB8F2', '#E99AC0', '#C6A4F2']

const isLeg = (x: unknown): x is TripLeg =>
  !!x && typeof x === 'object' && ['cid', 'from', 'to', 'mode'].every((k) => typeof (x as Record<string, unknown>)[k] === 'string')

/** Parse stored trips, dropping anything malformed. */
export function parseTrips(raw: unknown): TripState {
  if (!raw || typeof raw !== 'object') return EMPTY_TRIPS
  const r = raw as { trips?: unknown; active?: unknown }
  const trips = (Array.isArray(r.trips) ? r.trips : [])
    .filter((t): t is Trip => !!t && typeof t === 'object' && typeof t.id === 'string' && typeof t.name === 'string')
    .map((t) => ({ id: t.id, name: t.name, legs: Array.isArray(t.legs) ? t.legs.filter(isLeg) : [], updated: Number(t.updated) || 0 }))
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
  const out: string[] = []
  for (const l of trip.legs) {
    if (out.at(-1) !== l.from) out.push(l.from)
    out.push(l.to)
  }
  return out
}

export const tripEnd = (trip: Trip): string | null => trip.legs.at(-1)?.to ?? null

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
