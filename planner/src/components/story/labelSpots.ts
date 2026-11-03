import type { Box, Point } from './routeView'

// Where a label goes beside its flag or dot. A spot must clear every flag, dot and placed word and stay
// inside the map, the line under it only costs. Close by first, then further out on a short leader
// line, and a label with no clear spot at all waits for hover or focus.

/** right, left, above, below, then the diagonals */
export const SIDES: Point[] = [[1, 0], [-1, 0], [0, -1], [0, 1], [1, -1], [1, 1], [-1, -1], [-1, 1]]
const GAP = 6
/** how many steps further out a label may go on a leader line */
const REACH = 3
const RING = 8

export interface Ask {
  w: number
  h: number
  /** the flag or dot, x, y and radius */
  at: [number, number, number]
  /** the side it had last time, kept when it is still clear */
  side?: number
}
export interface Spot {
  box: Box
  left: number
  mid: number
  sx: number
  k: number
  /** the point on the flag's edge a leader line starts from */
  lead: Point | null
  /** no clear spot: shown on hover and focus only */
  peek: boolean
}

export const cover = (a: Box, b: Box) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]))

function at(l: Ask, k: number, out: number): Spot {
  const [x, y, r] = l.at
  const [sx, sy] = SIDES[k]
  const d = r + GAP + out
  const left = sx > 0 ? x + d : sx < 0 ? x - d - l.w : x - l.w / 2
  // a diagonal sits beside the flag, lifted or lowered by half its height, so it reads as beside and not apart
  const mid = sx ? y + sy * (l.h * 0.55 + out) : y + sy * (d + l.h / 2)
  const box: Box = [left, mid - l.h / 2, left + l.w, mid + l.h / 2]
  return { box, left, mid, sx, k, lead: null, peek: false }
}

/** Further out a label may sit at any of these angles around its flag, not only on the eight sides. */
const ANGLES = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8)

function around(l: Ask, angle: number, out: number): Spot {
  const [x, y, r] = l.at
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const d = r + GAP + out + Math.abs(cos) * l.w / 2 + Math.abs(sin) * l.h / 2
  const cx = x + cos * d
  const mid = y + sin * d
  const left = cx - l.w / 2
  return { box: [left, mid - l.h / 2, left + l.w, mid + l.h / 2], left, mid, sx: Math.abs(cos) > 0.3 ? Math.sign(cos) : 0, k: -1, lead: null, peek: false }
}

/** The leader starts on the flag's edge, pointed at the nearest point of the label. */
export function leadFrom([x, y, r]: [number, number, number], box: Box): Point {
  const px = Math.min(Math.max(x, box[0]), box[2])
  const py = Math.min(Math.max(y, box[1]), box[3])
  const d = Math.hypot(px - x, py - y) || 1
  return [x + (px - x) / d * r, y + (py - y) / d * r]
}

/** A leader line may not run through another word or flag, only out of its own. */
function crosses(a: [number, number, number], box: Box, hard: Box[], words: Box[]) {
  const [x1, y1] = leadFrom(a, box)
  const x2 = Math.min(Math.max(a[0], box[0]), box[2])
  const y2 = Math.min(Math.max(a[1], box[1]), box[3])
  const own = (b: Box) => a[0] >= b[0] && a[0] <= b[2] && a[1] >= b[1] && a[1] <= b[3]
  const others = [...hard.filter((b) => !own(b)), ...words]
  for (let t = 0.1; t < 1; t += 0.1) {
    const x = x1 + (x2 - x1) * t
    const y = y1 + (y2 - y1) * t
    if (others.some((b) => x > b[0] && x < b[2] && y > b[1] && y < b[3])) return true
  }
  return false
}

/**
 * The spot for one label. hard holds what words may never cover (flags, dots, the title), words the
 * labels placed before this one, soft what costs (the line). The chosen box is added to words.
 */
export function spotFor(l: Ask, hard: Box[], words: Box[], soft: Box[], bounds: Box): Spot {
  const inside = (b: Box) => b[0] >= bounds[0] && b[1] >= bounds[1] && b[2] <= bounds[2] && b[3] <= bounds[3]
  const clear = (b: Box) => inside(b) && !hard.some((h) => cover(b, h) > 0) && !words.some((w) => cover(b, w) > 0)
  const order = SIDES.map((_, k) => k)
  if (l.side != null && l.side >= 0) order.unshift(...order.splice(l.side, 1))
  const step = Math.max(l.h, l.at[2]) * 0.8
  // every ring out costs about as much as a word laid over a short stretch of the line
  let best: Spot | null = null
  let low = Infinity
  for (let ring = 0; ring <= REACH; ring++) {
    const tries = [...order.map((k) => at(l, k, ring * step)), ...(ring ? ANGLES.map((a) => around(l, a, (ring - 1) * step)) : [])]
    tries.forEach((s, n) => {
      if (!clear(s.box)) return
      if (ring && crosses(l.at, s.box, hard, words)) return
      // the line under a label matters less than keeping the reading order of the sides
      const cost = soft.reduce((c, b) => c + cover(s.box, b), 0) / Math.max(1, l.h) + n * 0.5 + ring * RING
      if (cost < low) { low = cost; best = { ...s, lead: ring ? leadFrom(l.at, s.box) : null } }
    })
  }
  if (best) {
    words.push((best as Spot).box)
    return best
  }
  // nothing is clear: the least covered close spot, kept out of the way of later words
  let near = at(l, order[0], 0)
  let least = Infinity
  order.forEach((k) => {
    const s = at(l, k, 0)
    const out = l.w * l.h - cover(s.box, bounds)
    const cost = out * 6 + [...hard, ...words].reduce((c, b) => c + cover(s.box, b), 0)
    if (cost < least) { least = cost; near = s }
  })
  return { ...near, peek: true }
}

/** Flags closer than this to a neighbour shrink before any of them is pushed aside. */
export function shrinkCluster(pts: Point[], r: number, least = 0.72): number[] {
  return pts.map((a, i) => {
    let near = Infinity
    pts.forEach((b, j) => { if (i !== j) near = Math.min(near, Math.hypot(b[0] - a[0], b[1] - a[1])) })
    // two flags side by side with a small gap is the goal, never below the least size
    return near >= r * 2 + 8 ? r : Math.max(r * least, Math.min(r, (near - 8) / 2))
  })
}
