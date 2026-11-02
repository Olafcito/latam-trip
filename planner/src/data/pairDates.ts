import { useEffect, useState } from 'react'
import type { PairDates } from '../lib/prices'
import { dataBase } from '@map/data/remoteFiles'
import { getFile } from '../lib/remoteFiles'
import { useDataRev } from './rev'

let cache: Promise<PairDates | null> | null = null

/** Forget the prices, so the next read fetches the build that was swapped in. */
export function clearPairDates(): void {
  cache = null
}

export function loadPairDates(): Promise<PairDates | null> {
  cache ??= (async () => {
    if (!dataBase()) return null
    try {
      const doc = await getFile<PairDates>('pair_dates.json')
      return doc && typeof doc.pairs === 'object' && doc.pairs !== null ? doc : null
    } catch {
      return null
    }
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
