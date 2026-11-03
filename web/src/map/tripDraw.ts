import type { LonLat } from '../lib/geo'

const d2 = (a: LonLat, b: LonLat) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2

/** A route line runs from its connection's first end. A trip leg draws from where it leaves, so the chevrons point the way it goes. */
export function orientLine(line: LonLat[], from: LonLat): LonLat[] {
  if (line.length < 2) return line
  return d2(line[0], from) <= d2(line[line.length - 1], from) ? line : [...line].reverse()
}

/** The number on a stop badge: one stop, or the first and last of a stack. */
export function stackLabel(first: number, last: number): string {
  return first === last ? String(first) : `${first}…${last}`
}

export interface StopPoint {
  type: 'Feature'
  properties: { n: string; first: number; last: number; end: boolean }
  geometry: { type: 'Point'; coordinates: LonLat }
}

/** One numbered point per place in travel order. A place visited twice gets one point with both numbers. */
export function stopPoints(order: string[], at: (id: string) => LonLat | null): StopPoint[] {
  const nums = new Map<string, number[]>()
  order.forEach((id, i) => nums.set(id, [...(nums.get(id) ?? []), i + 1]))
  return [...nums].flatMap(([id, n]) => {
    const ll = at(id)
    if (!ll) return []
    return [{ type: 'Feature' as const, properties: { n: n.join(','), first: n[0], last: n[n.length - 1], end: id === order.at(-1) }, geometry: { type: 'Point' as const, coordinates: ll } }]
  })
}
