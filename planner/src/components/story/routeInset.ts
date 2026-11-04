import type { Box, Point } from './routeView'

// A trip whose countries crowd into one corner of the map, Central America on a trip with Bolivia,
// shows that corner again, bigger, in room the map leaves free. These say which countries crowd and
// where their inset goes, the projection itself lives with the land.

/** The biggest group of points that each sit nearer than `near` to one of the others in it. */
export function clusterOf(pts: Point[], near: number): number[] {
  const group = pts.map((_, i) => i)
  const root = (i: number): number => (group[i] === i ? i : (group[i] = root(group[i])))
  pts.forEach((a, i) => pts.forEach((b, j) => {
    if (j > i && Math.hypot(a[0] - b[0], a[1] - b[1]) < near) group[root(j)] = root(i)
  }))
  const by = new Map<number, number[]>()
  pts.forEach((_, i) => by.set(root(i), [...(by.get(root(i)) ?? []), i]))
  const best = [...by.values()].sort((a, b) => b.length - a.length || a[0] - b[0])[0] ?? []
  return best.length > 1 ? best : []
}

export interface Inset { rect: Box; k: number }

const STEPS = 24

/**
 * The biggest rectangle of the crowd's shape, at least `least` times its size, that covers no other stop
 * and fits the area, the nearest one to where the crowd is. Nothing when there is no such room.
 */
export function insetFor(crowd: Box, others: { p: Point; r: number }[], area: Box, least = 1.6, most = 6, gap = 14): Inset | null {
  const bw = Math.max(crowd[2] - crowd[0], 1)
  const bh = Math.max(crowd[3] - crowd[1], 1)
  const cx = (crowd[0] + crowd[2]) / 2
  const cy = (crowd[1] + crowd[3]) / 2
  const clear = (r: Box) => others.every(({ p, r: radius }) => {
    const nx = Math.max(r[0], Math.min(p[0], r[2]))
    const ny = Math.max(r[1], Math.min(p[1], r[3]))
    return Math.hypot(p[0] - nx, p[1] - ny) >= radius + gap
  })
  for (let k = most; k >= least; k *= 0.94) {
    const w = bw * k
    const h = bh * k
    const freeX = area[2] - area[0] - w
    const freeY = area[3] - area[1] - h
    if (freeX < 0 || freeY < 0) continue
    let best: Box | null = null
    let far = Infinity
    for (let i = 0; i <= STEPS; i++) for (let j = 0; j <= STEPS; j++) {
      const x = area[0] + freeX * i / STEPS
      const y = area[1] + freeY * j / STEPS
      const r: Box = [x, y, x + w, y + h]
      const d = Math.hypot(x + w / 2 - cx, y + h / 2 - cy)
      if (d < far && clear(r)) { best = r; far = d }
    }
    if (best) return { rect: best, k }
  }
  return null
}
