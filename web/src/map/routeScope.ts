import { km, type LonLat } from '../lib/geo'

/** How close a row must be to the open route to count as along it. */
export const ROUTE_KM = 120

/** Rows whose point lies within `withinKm` of a vertex of `line` or of the midpoint of a segment. */
export function alongRoute<T>(rows: T[], at: (row: T) => LonLat | undefined, line: LonLat[], withinKm: number): T[] {
  const probes: LonLat[] = [...line]
  for (let i = 1; i < line.length; i++) {
    probes.push([(line[i - 1][0] + line[i][0]) / 2, (line[i - 1][1] + line[i][1]) / 2])
  }
  return rows.filter((row) => {
    const p = at(row)
    return !!p && probes.some((q) => km(p[1], p[0], q[1], q[0]) <= withinKm)
  })
}

/** The open trip as the layers see it: its stops in travel order, as points. */
export interface RouteScope {
  /** The open trip's id, so another trip starts along its own route */
  id?: string
  line: LonLat[]
}

/** Which trip the whole map toggle belongs to: a trip id, '' for a scope without one, null with no trip open. */
export const scopeKey = (scope: RouteScope | null): string | null => (scope ? scope.id ?? '' : null)

/** The whole map toggle and the trip it was set for. */
export interface WideState {
  trip: string | null
  wide: boolean
}

/** The toggle as it stands for `trip`: kept while the same trip is open, off again when another opens or it closes. */
export function wideForTrip(s: WideState, trip: string | null): WideState {
  return s.trip === trip ? s : { trip, wide: false }
}

/** The distance from a point to the nearest vertex of the line, in km. */
function nearestKm(p: LonLat, line: LonLat[]): number {
  return Math.min(...line.map((q) => km(p[1], p[0], q[1], q[0])))
}

/**
 * The rows a layer shows. With no scope, or with `wide`, every row in its own order. Otherwise only the rows along
 * the route, nearest to a stop first, so the list opens on the places along the trip.
 */
export function scopeRows<T>(rows: T[], at: (row: T) => LonLat | undefined, scope: RouteScope | null, wide: boolean): T[] {
  if (!scope || wide) return rows
  const along = alongRoute(rows, at, scope.line, ROUTE_KM)
  const dist = new Map(along.map((r) => [r, nearestKm(at(r)!, scope.line)]))
  return [...along].sort((a, b) => dist.get(a)! - dist.get(b)!)
}
