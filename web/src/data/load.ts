import type { DashFlight, DashJourney, DashTrip } from './dash'
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
  const data = await readMapData(base)
  // dev only, and left out of a production build along with the file it loads
  if (import.meta.env.DEV && typeof location !== 'undefined') {
    const which = new URLSearchParams(location.search).get('data')
    if (which) return (await import('./worst')).worstCase(data, which)
  }
  return data
}

async function readMapData(base: string): Promise<MapData> {
  const [places, connections, countries, flights, experiences, categories, lists] = await Promise.all([
    getJson<MapData['places']>('places', base),
    getJson<MapData['connections']>('connections', base),
    getJson<MapData['countries']>('countries', base),
    getJson<MapData['flights']>('flights', base).catch(() => []),
    getJson<MapData['experiences']>('experiences', base).catch(() => []),
    getJson<MapData['categories']>('experience_categories', base).catch(() => []),
    getJson<{ lists: MapData['lists'] }>('lists', base).then((r) => r.lists).catch(() => []),
  ])
  return { places, connections, countries, flights: flights ?? [], experiences: experiences ?? [], categories: categories ?? [], lists: lists ?? [] }
}

export interface DashData {
  trips: DashTrip[] | null
  journeys: DashJourney[] | null
  flights: DashFlight[] | null
}

/** One dash table, or null when its file is missing or broken, so the other tables still show. */
async function optional<T>(name: string, base: string): Promise<T[] | null> {
  try {
    const rows = await getJson<unknown>(name, base)
    return Array.isArray(rows) ? (rows as T[]) : null
  } catch {
    return null
  }
}

/** The flight option tables (dash_trips, dash_journeys, dash_flights). Each is null when its file is missing. */
export async function loadDash(base = BASE): Promise<DashData> {
  const [trips, journeys, flights] = await Promise.all([
    optional<DashTrip>('dash_trips', base),
    optional<DashJourney>('dash_journeys', base),
    optional<DashFlight>('dash_flights', base),
  ])
  return { trips, journeys, flights }
}
