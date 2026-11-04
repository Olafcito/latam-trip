import type { Connection, Place } from '../data/types'
import { boundsOf, type Bounds, type LonLat } from '../lib/geo'

const MIN_PAD = 0.25 // degrees on each side, so one point still gets a usable box

function point(id: string, byId: Map<string, Place>): LonLat | null {
  const p = byId.get(id)
  return p ? [p.lon, p.lat] : null
}

/** The box around every stop that resolves, or null when none does. */
export function tripBounds(stops: string[], byId: Map<string, Place>): Bounds | null {
  const pts = stops.map((s) => point(s, byId)).filter((p): p is LonLat => p !== null)
  return pts.length ? boundsOf(pts) : null
}

/** The box around one leg, or null unless both ends resolve. */
export function legBounds(conn: Pick<Connection, 'a' | 'b'>, byId: Map<string, Place>): Bounds | null {
  const a = point(conn.a, byId)
  const b = point(conn.b, byId)
  return a && b ? boundsOf([a, b]) : null
}

/** Grows a box by `share` of its own width and height on each side, never less than 0.25 degrees. */
export function padBounds(b: Bounds, share: number): Bounds {
  const padX = Math.max((b[1][0] - b[0][0]) * share, MIN_PAD)
  const padY = Math.max((b[1][1] - b[0][1]) * share, MIN_PAD)
  return [[b[0][0] - padX, b[0][1] - padY], [b[1][0] + padX, b[1][1] + padY]]
}
