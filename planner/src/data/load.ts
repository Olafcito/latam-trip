import type { AppData, BagRule, InOut, MapData, Meta, TripParams } from './types'

// Live data from the repo; public/data (npm run sync-data) is the offline copy.
export const REMOTE_BASE =
  (import.meta.env.VITE_DATA_BASE as string | undefined) ?? 'https://raw.githubusercontent.com/Olafcito/latam-trip/main/'
export const LOCAL_BASE = './data/'

async function getJson<T>(base: string, path: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(base + path, { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

async function loadFrom(base: string, timeoutMs: number) {
  const [inout, map, bags, trip, meta] = await Promise.all([
    getJson<InOut>(base, 'data/inout.json', timeoutMs),
    getJson<MapData>(base, 'data/network/map.json', timeoutMs),
    getJson<BagRule[]>(base, 'data/bag_rules.json', timeoutMs).catch(() => [] as BagRule[]),
    getJson<TripParams>(base, 'trip.json', timeoutMs).catch(() => ({}) as TripParams),
    // when the data was last checked. Optional: without it the freshness corner shows ?
    getJson<Meta>(base, 'data/web/meta.json', timeoutMs).then(
      (m) => (m && typeof m.last_checked === 'object' && m.last_checked !== null ? m : null),
      () => null,
    ),
  ])
  return { inout, map, bags, trip, meta }
}

export async function loadData(): Promise<AppData> {
  try {
    return { ...(await loadFrom(REMOTE_BASE, 15000)), source: 'github' }
  } catch (remoteErr) {
    try {
      return { ...(await loadFrom(LOCAL_BASE, 15000)), source: 'local' }
    } catch {
      throw remoteErr
    }
  }
}

/** quotes.csv link for a quote id (opens the raw file on GitHub). */
export function quoteLink(quoteId: string): string {
  return `https://github.com/Olafcito/latam-trip/blob/main/data/quotes.csv#:~:text=${encodeURIComponent(quoteId)}`
}
