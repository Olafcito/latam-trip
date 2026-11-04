import type { Way } from '../data/types'
import { pointsLost, type Loss, type LossKind } from './pairs'

// The marks on a row of the way picker: what the two ways of a pair lose points for, said once each. The
// hub nights add up, the rest name the way they sit on.

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
