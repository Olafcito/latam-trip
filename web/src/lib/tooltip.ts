export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export type Side = 'right' | 'left' | 'below' | 'above'

const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top

/**
 * Place a tooltip beside the things it describes, never on them.
 * `target` is the screen box of both cities and every stop. Tries right, left, below, above
 * and returns the first spot that fits inside the map and outside every blocked rect
 * (the panel, the controls). Falls back to the first spot that fits the map, then to a clamp.
 */
export function placeTip(
  target: Rect,
  size: { w: number; h: number },
  map: { w: number; h: number },
  blocked: Rect[] = [],
  gap = 16,
  margin = 10,
): { left: number; top: number; side: Side | null } {
  const midY = (target.top + target.bottom) / 2 - size.h / 2
  const midX = (target.left + target.right) / 2 - size.w / 2
  const clampX = (x: number) => Math.min(Math.max(x, margin), map.w - size.w - margin)
  const clampY = (y: number) => Math.min(Math.max(y, margin), map.h - size.h - margin)
  const candidates: [Side, number, number][] = [
    ['right', target.right + gap, clampY(midY)],
    ['left', target.left - gap - size.w, clampY(midY)],
    ['below', clampX(midX), target.bottom + gap],
    ['above', clampX(midX), target.top - gap - size.h],
  ]
  const rectAt = (x: number, y: number): Rect => ({ left: x, top: y, right: x + size.w, bottom: y + size.h })
  const inside = (r: Rect) => r.left >= margin && r.top >= margin && r.right <= map.w - margin && r.bottom <= map.h - margin
  const target2 = { left: target.left - 4, top: target.top - 4, right: target.right + 4, bottom: target.bottom + 4 }

  const free = (r: Rect) => inside(r) && !overlaps(r, target2) && !blocked.some((b) => overlaps(r, b))
  for (const [side, x, y] of candidates) {
    if (free(rectAt(x, y))) return { left: x, top: y, side }
  }
  // every spot is on something: slide each one just clear of the rect it hits, on either axis
  for (const [side, x, y] of candidates) {
    for (const b of blocked) {
      if (!overlaps(rectAt(x, y), b)) continue
      const slid: [number, number][] = [[x, b.top - size.h - 4], [x, b.bottom + 4], [b.left - size.w - 4, y], [b.right + 4, y]]
      for (const [sx, sy] of slid) if (free(rectAt(sx, sy))) return { left: sx, top: sy, side }
    }
  }
  for (const [side, x, y] of candidates) {
    const r = rectAt(x, y)
    if (inside(r) && !overlaps(r, target2)) return { left: x, top: y, side }
  }
  return { left: clampX(target.right + gap), top: clampY(midY), side: null }
}
