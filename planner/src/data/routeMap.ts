import { loadMapData } from '@map/data/load'
import { parseTripsFile, type TripRow } from '../lib/repoTrips'
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

const TRIPS_KEY = 'latam-planner.trips-file'

async function fetchTrips(base: string): Promise<unknown> {
  try {
    const res = await fetch(`${base}/web/trips.json`, { cache: 'no-store' })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

/**
 * The trips table (data/web/trips.json), from the same place as the route data. The last file read
 * is kept, so table trips keep their ways when the file cannot be reached.
 */
export async function loadRepoTrips(): Promise<TripRow[]> {
  const bases = import.meta.env.DEV ? ['/data'] : [REMOTE_BASE + 'data', LOCAL_BASE + 'data']
  for (const base of bases) {
    const raw = await fetchTrips(base)
    if (raw == null) continue
    try {
      localStorage.setItem(TRIPS_KEY, JSON.stringify(raw))
    } catch {
      // storage blocked: the file is read again next time
    }
    return parseTripsFile(raw)
  }
  try {
    return parseTripsFile(JSON.parse(localStorage.getItem(TRIPS_KEY) ?? 'null'))
  } catch {
    return []
  }
}
