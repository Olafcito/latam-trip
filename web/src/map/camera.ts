import type { Model } from '../data/model'
import { tripStops, type Trip } from '../data/trips'
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

/** What the map opens on: the open trip with a margin, else the core of the map. */
export function initialBounds(trip: Trip | null, model: Pick<Model, 'byId' | 'home'>): Bounds {
  const box = trip ? tripBounds(tripStops(trip), model.byId) : null
  return box ? padBounds(box, 0.15) : model.home
}

export interface Padding { top: number; left: number; right: number; bottom: number }

/**
 * The zoom that fits a box in a map of this size with this padding, the way MapLibre's cameraForBounds does
 * for an unrotated map with 512 pixel tiles. It needs no map, so the first view can be capped before the map exists.
 */
export function fitZoom(b: Bounds, width: number, height: number, pad: Padding): number {
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))
  const dx = Math.max((b[1][0] - b[0][0]) / 360, 1e-9)
  const dy = Math.max((y(b[1][1]) - y(b[0][1])) / (2 * Math.PI), 1e-9)
  const w = Math.max(width - pad.left - pad.right, 1)
  const h = Math.max(height - pad.top - pad.bottom, 1)
  return Math.log2(Math.min(w / (dx * 512), h / (dy * 512)))
}
