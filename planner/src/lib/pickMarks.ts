import type { FlightItem, Way } from '../data/types'
import { kr } from './format'
import { pointsLost, type Loss, type LossKind } from './pairs'

// The words of the way picker. The marks on a row say what the two ways of a pair lose points for, once
// each: the hub nights add up, the rest name the way they sit on. The rest put a way and a ticket in words.

export interface PairMark {
  kind: LossKind
  /** the whole fact, for the tooltip and the accessible name */
  label: string
  /** a short figure beside the icon */
  text?: string
}

/** One loss of one way in words. */
export function lossLabel(l: Loss): string {
  switch (l.kind) {
    case 'night': return l.points === 1 ? '1 hub night' : `${l.points} hub nights`
    case 'change': return 'A change between separate tickets'
    case 'us': return 'Through the United States'
    case 'long': return l.points > 1 ? 'Over 23 hours flying' : 'Over 20 hours flying'
  }
}

const ORDER: LossKind[] = ['night', 'change', 'us', 'long']

/** What the way in and the way home lose, one mark a kind: the hub nights summed, the rest with the way they sit on. */
export function pairMarks(wi: Way, wh: Way): PairMark[] {
  const a = pointsLost(wi)
  const b = pointsLost(wh)
  return ORDER.flatMap((kind): PairMark[] => {
    const x = a.find((l) => l.kind === kind)
    const y = b.find((l) => l.kind === kind)
    if (!x && !y) return []
    if (kind === 'night') {
      const n = (x?.points ?? 0) + (y?.points ?? 0)
      return [{ kind, label: lossLabel({ kind, points: n }), text: String(n) }]
    }
    const side = x && y ? 'both ways' : x ? 'way in' : 'way home'
    const points = Math.max(x?.points ?? 0, y?.points ?? 0)
    return [{ kind, label: `${lossLabel({ kind, points })}, ${side}` }]
  })
}

/** The stops of a way: Direct, 1 stop, 2 stops. */
export function stopsLabel(w: Way): string {
  const n = Math.max(0, w.flights - 1)
  return n === 0 ? 'Direct' : n === 1 ? '1 stop' : `${n} stops`
}

const flightsOf = (w: Way) => w.timeline.filter((t): t is FlightItem => t.kind === 'flight')
const unique = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]

/** The airlines of a way in flying order, each once. */
export function carriersOf(w: Way): string[] {
  return unique(flightsOf(w).flatMap((f) => f.carriers))
}

/** The flight numbers of a way, or its airlines for a flight the data has no numbers for. */
export function flightNumbersOf(w: Way): string[] {
  return unique(flightsOf(w).flatMap((f) => (f.flight_numbers?.length ? f.flight_numbers : f.carriers)))
}

/** A ticket leg as its two airports: "CPH>MAD" to ["CPH", "MAD"]. Anything else stays whole. */
export function legEnds(leg: string): [string, string] | null {
  const m = /^\s*([A-Z]{3})\s*>\s*([A-Z]{3})\s*$/.exec(leg)
  return m ? [m[1], m[2]] : null
}

const NOT_KNOWN = new Set(['', 'unknown', 'n/a', 'na'])

/** What a ticket says about a bag, in plain words. A checked bag that costs more carries its fee. */
export function bagWords(text: string | null, fee: number | null, checked = false): string {
  const t = (text ?? '').trim()
  const low = t.toLowerCase()
  if (NOT_KNOWN.has(low)) return fee ? kr(fee) : 'not known'
  if (low === 'incl' || low === 'included') return 'included'
  if (low === 'none' || low === 'not included') return 'not included'
  if (checked && low === 'paid') return fee ? `paid, ${kr(fee)}` : 'paid, fee not known'
  return t
}
