import type { Trip, TripLeg, TripState } from '@map/data/trips'
import type { Connection } from '@map/data/types'
import type { InOut, MapData, Mode } from '../data/types'
import { arcsFrom, edgeHours } from './graph'
import { hopFromArc, newJourney, type Hop, type Journey, type Place } from './journey'

// The Map tab shows the planner's journeys as the route map's trips. The planner stays the
// source of truth: each map edit is read back into journeys, and the map redraws from them.

export const OWN_WAY = 'Own way, no route in the data'

/** Numbers for a hop the planner's network lacks, read from the route map's connection. */
export type LegFacts = (from: string, to: string, mode: Mode) => Pick<Hop, 'operator' | 'hours' | 'price_dkk' | 'overnight' | 'border'> | null

export function legFactsFrom(connections: Connection[]): LegFacts {
  const byId = new Map(connections.map((c) => [c.id, c]))
  return (from, to, mode) => {
    const opt = byId
      .get([from, to].sort().join('-'))
      ?.options.filter((o) => o.mode === mode)
      .sort((x, y) => (x.duration_min ?? 1e9) - (y.duration_min ?? 1e9))[0]
    if (!opt) return null
    return {
      operator: opt.operators.join(', ') || null,
      hours: opt.duration_min == null ? null : Math.round((opt.duration_min / 60) * 10) / 10,
      price_dkk: opt.price_dkk.min,
      overnight: opt.overnight,
      border: opt.border,
    }
  }
}

export function journeyToTrip(j: Journey, updated = Date.parse(j.savedAt ?? '') || 0): Trip {
  const legs: TripLeg[] = j.places.slice(1).map((p, i) => {
    const from = j.places[i].node
    return { cid: [from, p.node].sort().join('-'), from, to: p.node, mode: p.hop?.mode ?? 'bus' }
  })
  return { id: j.id, name: j.name, legs, updated, start: j.places[0]?.node }
}

/** Saved journeys plus the current one (its live copy wins). The current one is open while the map shows it. */
export function toTripState(current: Journey | null, saved: Journey[], open: boolean): TripState {
  const list = saved.map((s) => (s.id === current?.id ? current : s))
  if (current && !saved.some((s) => s.id === current.id)) list.push(current)
  return {
    trips: list.map((j) => journeyToTrip(j, j === current ? Date.now() : undefined)),
    active: open && current ? current.id : null,
  }
}

/** A hop from one place to the next: the network's arc of that mode, else the map's numbers, else any arc, else own way. */
export function hopBetween(map: MapData, from: string, to: string, mode: Mode | null, facts?: LegFacts): Hop {
  const arcs = arcsFrom(map, from)
    .filter((a) => a.to === to)
    .sort((a, b) => (edgeHours(a.edge) ?? 1e9) - (edgeHours(b.edge) ?? 1e9))
  const same = mode ? arcs.find((a) => a.edge.mode === mode) : arcs[0]
  if (same) return hopFromArc(from, same, null)
  const f = mode ? facts?.(from, to, mode) : null
  if (mode && f) return { from, to, mode, flight: null, ...f }
  if (arcs[0]) return hopFromArc(from, arcs[0], null)
  return { from, to, mode: mode ?? 'bus', operator: OWN_WAY, hours: null, price_dkk: null, overnight: false, border: false, flight: null }
}

const sameLeg = (a: TripLeg, b: TripLeg) => a.from === b.from && a.to === b.to && a.mode === b.mode

/**
 * Places for a new list of legs. Removing one leg drops the place it led to and rejoins its
 * neighbours. Anything else keeps the places that still match (with their nights and picked
 * flights) and adds the rest with 2 nights. A leg that starts away from the last place gets a hop there first.
 */
export function placesFromLegs(j: Journey, legs: TripLeg[], map: MapData, facts?: LegFacts): Place[] {
  const old = journeyToTrip(j).legs
  if (legs.length === old.length - 1) {
    const i = old.findIndex((l, k) => !legs[k] || !sameLeg(l, legs[k]))
    if (legs.slice(i).every((l, k) => sameLeg(l, old[i + 1 + k]))) {
      const places = j.places.filter((_, k) => k !== i + 1)
      const next = places[i + 1]
      if (next) places[i + 1] = { ...next, hop: hopBetween(map, places[i].node, next.node, next.hop?.mode ?? null, facts) }
      return places
    }
  }
  const pool = j.places.slice(1).map((p, k) => ({ p, from: j.places[k].node, used: false }))
  const take = (from: string, to: string, mode: Mode | null): Place => {
    const hit = pool.find((x) => !x.used && x.from === from && x.p.node === to && (mode == null || x.p.hop?.mode === mode))
    if (hit) {
      hit.used = true
      return hit.p
    }
    return { node: to, nights: 2, hop: hopBetween(map, from, to, mode, facts) }
  }
  const places: Place[] = [j.places[0]]
  for (const l of legs) {
    const prev = places[places.length - 1].node
    if (l.from !== prev) places.push(take(prev, l.from, null))
    places.push(take(l.from, l.to, l.mode))
  }
  return places
}

export interface Applied {
  current: Journey | null
  saved: Journey[]
  open: boolean
}

/**
 * Read a map edit back into journeys. Every journey the map touches is saved, so the map's
 * "saved" holds. A new trip starts on the current (or last saved) way in and way home; with
 * neither there is nothing to start from, and the result is null.
 */
export function applyTrips(
  inout: InOut,
  map: MapData,
  current: Journey | null,
  saved: Journey[],
  open: boolean,
  after: TripState,
  facts?: LegFacts,
): Applied | null {
  const before = toTripState(current, saved, open)
  const now = new Date().toISOString()
  let cur = current
  let list = saved
  const keep = (j: Journey): Journey => {
    const c = { ...j, savedAt: now }
    list = [...list.filter((s) => s.id !== c.id), c]
    return c
  }
  const afterIds = new Set(after.trips.map((t) => t.id))
  for (const t of before.trips) {
    if (afterIds.has(t.id)) continue
    list = list.filter((s) => s.id !== t.id)
    if (cur?.id === t.id) cur = null
  }
  for (const t of after.trips) {
    const b = before.trips.find((x) => x.id === t.id)
    if (!b) {
      const base = cur ?? list[list.length - 1] ?? null
      const wi = base && inout.ways[base.wayIn]
      const wh = base && inout.ways[base.wayHome]
      if (!base || !wi || !wh) return null
      if (cur) keep(cur)
      cur = keep({ ...newJourney(inout, wi, wh, base.optionId), id: t.id, name: t.name })
      continue
    }
    const legsChanged = JSON.stringify(t.legs) !== JSON.stringify(b.legs)
    if (!legsChanged && t.name === b.name) continue
    const j = cur?.id === t.id ? cur : list.find((s) => s.id === t.id)
    if (!j) continue
    const edited = keep({ ...j, name: t.name, places: legsChanged ? placesFromLegs(j, t.legs, map, facts) : j.places })
    if (cur?.id === t.id) cur = edited
  }
  if (after.active && after.active !== cur?.id) {
    const next = list.find((s) => s.id === after.active)
    if (next) {
      if (cur) keep(cur)
      cur = next
    }
  }
  return { current: cur, saved: list, open: after.active != null && cur != null }
}
