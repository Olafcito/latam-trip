import type { MapData } from './types'

// Dev: the Vite middleware serves the repo's data/ folder at /data.
// Build: set VITE_DATA_BASE, e.g. https://raw.githubusercontent.com/Olafcito/latam-trip/main/data
const BASE = (import.meta.env.VITE_DATA_BASE as string | undefined)?.replace(/\/$/, '') ?? '/data'

async function getJson<T>(name: string, base: string): Promise<T> {
  const res = await fetch(`${base}/web/${name}.json`)
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export async function loadMapData(base = BASE): Promise<MapData> {
  const [places, connections, countries] = await Promise.all([
    getJson<MapData['places']>('places', base),
    getJson<MapData['connections']>('connections', base),
    getJson<MapData['countries']>('countries', base),
  ])
  return { places, connections, countries }
}

/** The ranked trips to start from (data/saved_trips.json). Missing file: no seeds. */
export async function loadSeedTrips(base = BASE): Promise<unknown> {
  try {
    const res = await fetch(`${base}/saved_trips.json`)
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}
