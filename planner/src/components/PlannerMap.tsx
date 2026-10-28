import { useCallback, useEffect, useMemo, useState } from 'react'
import { RouteMap } from '@map/map/RouteMap'
import type { TripState } from '@map/data/trips'
import type { MapData as RouteData } from '@map/data/types'
import { loadRouteData } from '../data/routeMap'
import { legFactsFrom, toTripState } from '../lib/mapTrips'
import { useStore } from '../store'
import { MapSide } from './TripPanel'

/**
 * The route map with the planner's journeys as its trips, where journeys are built. Every edit
 * on the map is a journey edit, so the builder and the totals follow it.
 */
export function PlannerMap() {
  const inout = useStore((s) => s.data?.inout)
  const journey = useStore((s) => s.journey)
  const saved = useStore((s) => s.saved)
  const mapOpen = useStore((s) => s.mapOpen)
  const applyMapTrips = useStore((s) => s.applyMapTrips)
  const cursor = useStore((s) => s.cursor)
  const cursorTo = useStore((s) => s.cursorTo)
  const insertLeg = useStore((s) => s.insertLeg)
  const setLegFacts = useStore((s) => s.setLegFacts)
  const [data, setData] = useState<RouteData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadRouteData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const trips = useMemo(() => toTripState(journey, saved, mapOpen, inout), [journey, saved, mapOpen, inout])
  const facts = useMemo(() => (data ? legFactsFrom(data.connections) : undefined), [data])
  useEffect(() => {
    if (facts) setLegFacts(facts)
  }, [facts, setLegFacts])
  const focusAt = journey && cursor != null ? journey.places[cursor]?.node ?? null : null
  const onTrips = useCallback(
    (update: (s: TripState) => TripState) => {
      const { journey: j, saved: s, mapOpen: o, data: d } = useStore.getState()
      applyMapTrips(update(toTripState(j, s, o, d?.inout)), facts)
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
  return data ? (
    <RouteMap
      data={data}
      trips={trips}
      onTrips={onTrips}
      fitTripOnLoad
      focus={mapOpen && !!journey}
      focusAt={focusAt}
      onStop={cursorTo}
      onLeg={insertLeg}
      side={<MapSide />}
    />
  ) : (
    <div className="loading">Loading routes…</div>
  )
}
