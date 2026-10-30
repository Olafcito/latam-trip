export type LonLat = [number, number]

/** The distance in km between two points on the globe. */
export function km(aLat: number, aLon: number, bLat: number, bLon: number) {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLon = (bLon - aLon) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
  return 6371 * 2 * Math.asin(Math.sqrt(h))
}

// Web Mercator in unit space, so arcs bend the same way they look on the map.
function toMerc([lon, lat]: LonLat): [number, number] {
  const s = Math.sin((lat * Math.PI) / 180)
  return [(lon + 180) / 360, 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)]
}

function fromMerc([x, y]: [number, number]): LonLat {
  const lat = (360 / Math.PI) * Math.atan(Math.exp((0.5 - y) * 2 * Math.PI)) - 90
  return [x * 360 - 180, lat]
}

/**
 * A quadratic bezier from a to b, bowed sideways by `bend` times the chord length.
 * The bow is always to the left of the a to b direction, so callers pass a fixed order
 * (the connection's sorted a and b) to keep both directions on one arc.
 */
export function arc(a: LonLat, b: LonLat, bend = 0.18, steps = 32): LonLat[] {
  const p0 = toMerc(a)
  const p2 = toMerc(b)
  const dx = p2[0] - p0[0]
  const dy = p2[1] - p0[1]
  const c: [number, number] = [(p0[0] + p2[0]) / 2 + dy * bend, (p0[1] + p2[1]) / 2 - dx * bend]
  const out: LonLat[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    out.push(fromMerc([u * u * p0[0] + 2 * u * t * c[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p2[1]]))
  }
  return out
}

/** A path through a list of points: straight for ground and boat, arcs for flights. */
export function pathThrough(points: LonLat[], curved: boolean): LonLat[] {
  if (!curved) return points
  const out: LonLat[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const seg = arc(points[i], points[i + 1], 0.16, 24)
    out.push(...(i === 0 ? seg : seg.slice(1)))
  }
  return out
}

export type Bounds = [[number, number], [number, number]]

export function boundsOf(points: LonLat[]): Bounds {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity
  for (const [lon, lat] of points) {
    if (lon < w) w = lon
    if (lon > e) e = lon
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [[w, s], [e, n]]
}

/** Point at fraction t (0..1) along a polyline, by length in lon/lat space. */
export function along(line: LonLat[], t: number): LonLat {
  if (line.length === 1) return line[0]
  const seg: number[] = []
  let total = 0
  for (let i = 1; i < line.length; i++) {
    const d = Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1])
    seg.push(d)
    total += d
  }
  let target = Math.min(Math.max(t, 0), 1) * total
  for (let i = 0; i < seg.length; i++) {
    if (target <= seg[i] || i === seg.length - 1) {
      const f = seg[i] === 0 ? 0 : Math.min(target / seg[i], 1)
      return [line[i][0] + (line[i + 1][0] - line[i][0]) * f, line[i][1] + (line[i + 1][1] - line[i][1]) * f]
    }
    target -= seg[i]
  }
  return line[line.length - 1]
}

/** CSS cubic-bezier(x1, y1, x2, y2) as an easing function, for MapLibre camera moves. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const bx = (t: number) => 3 * x1 * t * (1 - t) ** 2 + 3 * x2 * t * t * (1 - t) + t ** 3
  const by = (t: number) => 3 * y1 * t * (1 - t) ** 2 + 3 * y2 * t * t * (1 - t) + t ** 3
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0, hi = 1, t = x
    for (let i = 0; i < 30; i++) {
      t = (lo + hi) / 2
      if (bx(t) < x) lo = t
      else hi = t
    }
    return by(t)
  }
}

/** The handoff's main ease: cubic-bezier(.22,.9,.24,1). */
export const EASE = cubicBezier(0.22, 0.9, 0.24, 1)
