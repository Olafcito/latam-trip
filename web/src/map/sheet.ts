// The physics of the phone sheet, apart from the pointer: where it can rest, where a release lands, and a spring
// that carries the finger's speed on. Positions are the sheet's offset down from its top detent, in pixels.

/** The share of a phone map a mode's panel takes. Above this the markers no longer fit beside it. The CSS reads it as --mode-sheet. */
export const MODE_SHEET = 0.42
/** What stays on screen when the sheet is folded: the handle and the title row. */
export const SHEET_PEEK = 72
/** A release slower than this, in px/s, has no direction of its own. */
const FLICK = 110
/** A press that moved less than this is a tap. */
export const TAP_SLOP = 10
/** Only the last moments of a drag say how fast it is going, in ms. */
const TRAIL_MS = 100

export const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const DETENTS = ['peek', 'half', 'full'] as const
export type Detent = (typeof DETENTS)[number]
export type DetentOffsets = Record<Detent, number>

/** How far down the sheet sits at each detent. `sheet` is its own height, `map` that of the map under it. */
export function detentOffsets(sheet: number, map: number, safeBottom = 0): DetentOffsets {
  const peek = Math.max(0, sheet - SHEET_PEEK - safeBottom)
  return { full: 0, half: Math.min(peek, Math.max(0, sheet - Math.round(map * MODE_SHEET))), peek }
}

/** Where a throw comes to rest, as scrolling decelerates. Velocity in px/s. */
export const project = (velocity: number, deceleration = 0.998) => ((velocity / 1000) * deceleration) / (1 - deceleration)

/** Past a boundary the sheet follows less and less, the further it is pulled. */
export const rubberband = (overshoot: number, dimension: number, constant = 0.55) =>
  (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))

/** A drag's position with both ends soft. */
export function dragTo(raw: number, top: number, bottom: number, dimension: number) {
  if (raw < top) return top + rubberband(raw - top, dimension)
  if (raw > bottom) return bottom + rubberband(raw - bottom, dimension)
  return raw
}

/** The detent a release lands on: the one nearest where the throw would end, never against a real flick. */
export function settleOn(offsets: DetentOffsets, at: number, velocity: number): Detent {
  const end = at + project(velocity)
  const ahead = DETENTS.filter((d) => Math.abs(velocity) < FLICK || (velocity < 0 ? offsets[d] <= at : offsets[d] >= at))
  const pool = ahead.length ? ahead : DETENTS
  return pool.reduce((best, d) => (Math.abs(offsets[d] - end) < Math.abs(offsets[best] - end) ? d : best))
}

export interface TrailPoint {
  t: number
  y: number
}

/** Keeps the moments that count for the speed. */
export const trimTrail = (trail: TrailPoint[], now: number) => trail.filter((p) => now - p.t <= TRAIL_MS)

/** The speed at release in px/s, from the last moments of the drag. A finger that stopped before lifting threw nothing. */
export function releaseVelocity(trail: TrailPoint[], now: number): number {
  const recent = trimTrail(trail, now)
  if (recent.length < 2) return 0
  const first = recent[0]
  const last = recent[recent.length - 1]
  const span = last.t - first.t
  return span > 0 ? ((last.y - first.y) / span) * 1000 : 0
}

export interface SpringState {
  x: number
  v: number
}

export interface SpringShape {
  /** Seconds: how soon it gets there. */
  response: number
  /** 1 settles without passing the target, below 1 overshoots. */
  damping: number
}

export const SPRING_CALM: SpringShape = { response: 0.3, damping: 1 }
/** Only a throw has earned a little bounce. */
export const SPRING_THROWN: SpringShape = { response: 0.3, damping: 0.8 }
/** From here on a release counts as a throw. */
export const THROW = 900

const STEP = 1 / 240

/** Advances a spring by `dt` seconds, from where it is and how fast it goes, so a new target never jumps. */
export function springStep(s: SpringState, target: number, dt: number, shape: SpringShape): SpringState {
  const w = (2 * Math.PI) / shape.response
  const k = w * w
  const c = 2 * shape.damping * w
  let { x, v } = s
  for (let left = dt; left > 0; left -= STEP) {
    const h = Math.min(STEP, left)
    v += (-k * (x - target) - c * v) * h
    x += v * h
  }
  return { x, v }
}

export const springDone = (s: SpringState, target: number) => Math.abs(s.x - target) < 0.5 && Math.abs(s.v) < 8

/** The next detent the handle's tap or keys go to. A tap goes up, and from the top back down. */
export function nextDetent(d: Detent, how: 'tap' | 'up' | 'down'): Detent {
  const i = DETENTS.indexOf(d)
  if (how === 'up') return DETENTS[Math.min(i + 1, DETENTS.length - 1)]
  if (how === 'down') return DETENTS[Math.max(i - 1, 0)]
  return d === 'full' ? 'half' : DETENTS[i + 1]
}
