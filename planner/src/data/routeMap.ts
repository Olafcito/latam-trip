import { loadMapData, loadSeedTrips } from '@map/data/load'
import { parseSeedFile, type Trip } from '@map/data/trips'
import type { MapData as RouteData } from '@map/data/types'
import { LOCAL_BASE, REMOTE_BASE } from './load'

let cache: Promise<RouteData> | null = null

/** The route map's places and connections: the repo's data/web in dev, else GitHub, else the offline copy. */
export function loadRouteData(): Promise<RouteData> {
  cache ??= (async () => {
    if (import.meta.env.DEV) return loadMapData('/data')
    try {
      return await loadMapData(REMOTE_BASE + 'data')
    } catch (remoteErr) {
      try {
        return await loadMapData(LOCAL_BASE + 'data')
      } catch {
        throw remoteErr
      }
    }
  })()
  cache.catch(() => (cache = null))
  return cache
}

const SEEDS_KEY = 'latam-planner.seed-file'

/**
 * The ranked trips in data/saved_trips.json, from the same place as the route data. The last
 * file read is kept, so seeded journeys keep their ways when the file cannot be reached.
 */
export async function loadSeeds(): Promise<Trip[]> {
  const bases = import.meta.env.DEV ? ['/data'] : [REMOTE_BASE + 'data', LOCAL_BASE + 'data']
  for (const base of bases) {
    const raw = await loadSeedTrips(base)
    const seeds = parseSeedFile(raw)
    if (!seeds.length) continue
    try {
      localStorage.setItem(SEEDS_KEY, JSON.stringify(raw))
    } catch {
      // storage blocked: the file is read again next time
    }
    return seeds
  }
  try {
    return parseSeedFile(JSON.parse(localStorage.getItem(SEEDS_KEY) ?? 'null'))
  } catch {
    return []
  }
}
