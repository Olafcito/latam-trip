import { loadMapData } from '@map/data/load'
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
