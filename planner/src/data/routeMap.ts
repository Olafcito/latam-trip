import { loadMapData } from '@map/data/load'
import type { TripRow } from '../lib/repoTrips'
import type { MapData as RouteData } from '@map/data/types'
import { dataBase } from '@map/data/remoteFiles'
import { loadTrips } from '../lib/remoteTrips'
import { remoteEnabled } from '../lib/supabase'

let cache: Promise<RouteData> | null = null

/** The route map's places and connections, read from the Supabase bucket cache. */
/** Forget the route data, so the next read fetches the build that was swapped in. */
export function clearRouteData(): void {
  cache = null
}

export function loadRouteData(): Promise<RouteData> {
  cache ??= (async () => {
    if (!dataBase()) throw new Error('Supabase data is not configured. Set VITE_DATA_BASE before starting the app.')
    return loadMapData()
  })()
  cache.catch(() => (cache = null))
  return cache
}

/**
 * Trips are read live from Supabase, so the list reflects edits from other devices.
 */
export async function loadRepoTrips(): Promise<TripRow[]> {
  if (!remoteEnabled()) throw new Error('Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_KEY before starting the app.')
  return loadTrips()
}
