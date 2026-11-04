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

/** How a trip leg draws: with one of the trip's stops selected, its legs in and out are lit and the rest step back. */
export type LegState = 'lit' | 'dim' | 'plain'

export function legState(leg: { from: string; to: string }, sel: string | null, stops: string[]): LegState {
  if (!sel || !stops.includes(sel)) return 'plain'
  return leg.from === sel || leg.to === sel ? 'lit' : 'dim'
}

/** The stops at the far end of a stop's legs in and out, the places its own connections reach. */
export function legEnds(legs: { from: string; to: string }[], sel: string): string[] {
  const out = new Set<string>()
  for (const l of legs) {
    if (l.from === sel && l.to !== sel) out.add(l.to)
    if (l.to === sel && l.from !== sel) out.add(l.from)
  }
  return [...out]
}

/** A place off the open trip draws quiet, a small dim dot with no label until the map is zoomed in. Nothing is off with no trip open. */
export function offTrip(id: string, stops: ReadonlySet<string> | null): boolean {
  return !!stops && !stops.has(id)
}

/**
 * Whether a place's fan of connections draws. With no trip open it always does, that is the atlas. With a trip open a
 * stop of the trip keeps its fan off until the alternatives are asked for, and any other place shows its own.
 */
export function showFan(sel: string | null, stops: ReadonlySet<string> | null, asked: boolean): boolean {
  if (!sel) return false
  return !stops || !stops.has(sel) || asked
}
