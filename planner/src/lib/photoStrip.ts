// Where a strip of photos stands: the place's strip and the large viewer both hold one photo per width and snap to it.

/** The photo in view, from how far the strip has scrolled. Always one of the photos, never past either end. */
export function photoAt(scrollLeft: number, width: number, count: number): number {
  if (count < 1) return 0
  return clampPhoto(Math.round(scrollLeft / Math.max(1, width)), count)
}

/** A photo index kept inside the strip. */
export function clampPhoto(i: number, count: number): number {
  if (count < 1 || !Number.isFinite(i)) return 0
  return Math.min(count - 1, Math.max(0, Math.trunc(i)))
}

/** The photo one step back (-1) or on (1), staying at the end when there is none further. */
export function stepPhoto(at: number, dir: -1 | 1, count: number): number {
  return clampPhoto(at + dir, count)
}

/** The arrow for a key: Left and Right step, anything else is not the strip's. */
export function keyStep(key: string): -1 | 1 | null {
  return key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : null
}
