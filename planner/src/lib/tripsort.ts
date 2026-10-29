// Ordering for the Trips timetable, and the best value per line of the compare tray.

export type SortKey = 'rank' | 'price' | 'air'

export interface SortRow {
  /** a ranked trip from the trips table (data/web/trips.json) */
  rank?: number
  savedAt?: string
  /** the trip being built that is not saved yet */
  draft: boolean
  /** all in, in kr. Null when the trip cannot be priced. */
  total: number | null
  /** hours in the air. Null when unknown. */
  air: number | null
}

const known = (n: number | null): n is number => n != null && Number.isFinite(n)

/** Unknown values go last whichever way the list runs. */
function byValue(a: number | null, b: number | null): number {
  if (!known(a)) return known(b) ? 1 : 0
  if (!known(b)) return -1
  return a - b
}

/** rank: the ranked trips by rank, then the ones you saved in the order you saved them, then the unsaved draft. */
function byRank(a: SortRow, b: SortRow): number {
  const group = (r: SortRow) => (r.draft ? 2 : r.rank != null ? 0 : 1)
  const g = group(a) - group(b)
  if (g) return g
  if (a.rank != null && b.rank != null) return a.rank - b.rank
  return (a.savedAt ?? '').localeCompare(b.savedAt ?? '')
}

/** A new array in the order of the key. Ties keep the order they came in. */
export function sortTrips<T extends SortRow>(rows: readonly T[], key: SortKey): T[] {
  const cmp = key === 'rank' ? byRank : key === 'price' ? (a: T, b: T) => byValue(a.total, b.total) : (a: T, b: T) => byValue(a.air, b.air)
  return rows
    .map((row, i) => ({ row, i }))
    .sort((a, b) => cmp(a.row, b.row) || a.i - b.i)
    .map((x) => x.row)
}

export const SORT_LABEL: Record<SortKey, string> = { rank: 'rank', price: 'price', air: 'air time' }

/**
 * The columns holding the lowest known value of a line, for the amber dot. Nothing is marked when
 * fewer than two values are known or every known value is the same, so a dot always means "less
 * than another trip".
 */
export function lowest(values: readonly (number | null)[]): Set<number> {
  const k = values.map((v, i) => ({ v, i })).filter((x): x is { v: number; i: number } => known(x.v))
  if (k.length < 2) return new Set()
  const min = Math.min(...k.map((x) => x.v))
  if (k.every((x) => x.v === min)) return new Set()
  return new Set(k.filter((x) => x.v === min).map((x) => x.i))
}
