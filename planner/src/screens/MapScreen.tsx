import { useCallback, useEffect, useMemo, useState } from 'react'
import { RouteMap } from '@map/map/RouteMap'
import type { TripState } from '@map/data/trips'
import type { MapData as RouteData } from '@map/data/types'
import { loadRouteData } from '../data/routeMap'
import { legFactsFrom, toTripState } from '../lib/mapTrips'
import { useStore } from '../store'

/** The route map, with the planner's journeys as its trips. */
export function MapScreen() {
  const journey = useStore((s) => s.journey)
  const saved = useStore((s) => s.saved)
  const mapOpen = useStore((s) => s.mapOpen)
  const applyMapTrips = useStore((s) => s.applyMapTrips)
  const [data, setData] = useState<RouteData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRouteData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const trips = useMemo(() => toTripState(journey, saved, mapOpen), [journey, saved, mapOpen])
  const facts = useMemo(() => (data ? legFactsFrom(data.connections) : undefined), [data])
  const onTrips = useCallback(
    (update: (s: TripState) => TripState) => {
      const { journey: j, saved: s, mapOpen: open } = useStore.getState()
      applyMapTrips(update(toTripState(j, s, open)), facts)
    },
    [applyMapTrips, facts],
  )

  if (error) {
    return (
      <div className="card loading">
        <b>Could not load the route map</b>
        <p className="small">{error}</p>
      </div>
    )
  }
  return (
    <div className="mapscreen">
      {data ? <RouteMap data={data} trips={trips} onTrips={onTrips} fitTripOnLoad /> : <div className="loading">Loading routes…</div>}
    </div>
  )
}
