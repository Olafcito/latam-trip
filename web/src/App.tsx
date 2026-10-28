import { useEffect, useState } from 'react'
import { loadMapData, loadSeedTrips } from './data/load'
import { mergeSeeds, parseSeedFile, readSeeded, readTrips, writeSeeded, writeTrips, type TripState } from './data/trips'
import type { MapData } from './data/types'
import { RouteMap } from './map/RouteMap'

export function App() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // every edit is saved straight away, so a trip being built survives a reload
  const [trips, setTrips] = useState<TripState>(readTrips)

  useEffect(() => {
    loadMapData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])
  useEffect(() => writeTrips(trips), [trips])
  // ranked scenarios from data/saved_trips.json join the saved trips once per browser
  useEffect(() => {
    loadSeedTrips().then((raw) => {
      const seeds = parseSeedFile(raw)
      if (!seeds.length) return
      setTrips((s) => {
        const { state, imported } = mergeSeeds(s, seeds, readSeeded())
        writeSeeded(imported)
        return state
      })
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
      <RouteMap data={data} trips={trips} onTrips={setTrips} />
    </main>
  )
}
