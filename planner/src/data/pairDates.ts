import { useEffect, useState } from 'react'
import type { PairDates } from '../lib/prices'
import { dataBase } from '@map/data/remoteFiles'
import { getFile } from '../lib/remoteFiles'
import { LOCAL_BASE, REMOTE_BASE } from './load'
import { useDataRev } from './rev'

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

/** Forget the prices, so the next read fetches the build that was swapped in. */
export function clearPairDates(): void {
  cache = null
}

export function loadPairDates(): Promise<PairDates | null> {
  cache ??= (async () => {
    if (dataBase()) {
      try {
        const doc = await getFile<PairDates>('pair_dates.json')
        return doc && typeof doc.pairs === 'object' && doc.pairs !== null ? doc : null
      } catch {
        return null
      }
    }
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
  const rev = useDataRev()
  useEffect(() => {
    let live = true
    loadPairDates().then((d) => live && setPd(d))
    return () => {
      live = false
    }
  }, [rev])
  return pd
}
