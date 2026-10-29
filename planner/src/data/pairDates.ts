import { useEffect, useState } from 'react'
import type { PairDates } from '../lib/prices'
import { LOCAL_BASE, REMOTE_BASE } from './load'

// data/web/pair_dates.json: the repo's file in dev, else GitHub, else the offline copy. Optional:
// without it the trip hero shows no prices and offers a search instead.

const FILE = 'data/web/pair_dates.json'
let cache: Promise<PairDates | null> | null = null

async function get(url: string): Promise<PairDates> {
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`pair_dates.json: HTTP ${res.status}`)
  const doc = (await res.json()) as PairDates
  if (!doc || typeof doc.pairs !== 'object' || doc.pairs === null) throw new Error('pair_dates.json: no pairs')
  return doc
}

export function loadPairDates(): Promise<PairDates | null> {
  cache ??= (async () => {
    const bases = import.meta.env.DEV ? ['/'] : [REMOTE_BASE, LOCAL_BASE]
    for (const base of bases) {
      try {
        return await get(base + FILE)
      } catch {
        // try the next copy
      }
    }
    return null
  })()
  return cache
}

/** The prices by date, null while loading or when no copy could be read. */
export function usePairDates(): PairDates | null {
  const [pd, setPd] = useState<PairDates | null>(null)
  useEffect(() => {
    let live = true
    loadPairDates().then((d) => live && setPd(d))
    return () => {
      live = false
    }
  }, [])
  return pd
}
