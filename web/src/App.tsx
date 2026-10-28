import { useCallback, useEffect, useState } from 'react'
import { loadMapData } from './data/load'
import type { Connection, MapData, RouteOption } from './data/types'
import { RouteMap } from './map/RouteMap'

const JOURNEY_KEY = 'latam-trip.journey'

function readJourney(): string[] {
  try {
    const raw = localStorage.getItem(JOURNEY_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function App() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [journey, setJourney] = useState<string[]>(readJourney)

  useEffect(() => {
    loadMapData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  // The journey tab is not built yet. Adding a leg toggles it in a local list for now.
  const addToJourney = useCallback((conn: Connection, opt: RouteOption) => {
    setJourney((cur) => {
      const key = `${conn.id}|${opt.mode}`
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
      try {
        localStorage.setItem(JOURNEY_KEY, JSON.stringify(next))
      } catch {
        // storage blocked: the list still works for this session
      }
      return next
    })
  }, [])

  if (error) {
    return (
      <main className="app-msg">
        <p className="app-msg-t">Could not load the route data</p>
        <p className="mono">{error}</p>
        <p>Run <code>python src/build_web_data.py</code> from the repo root, then reload.</p>
      </main>
    )
  }
  if (!data) return <main className="app-msg mono">Loading routes…</main>
  return (
    <main className="app">
      <RouteMap data={data} journey={journey} onAddToJourney={addToJourney} />
    </main>
  )
}
