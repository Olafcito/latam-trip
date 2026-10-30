import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import { RouteMap } from '@map/map/RouteMap'
import { buildModel } from '@map/data/model'
import type { TripState } from '@map/data/trips'
import type { Family, MapData as RouteData } from '@map/data/types'
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
  const idle = useStore((s) => s.idle)
  const cursorTo = useStore((s) => s.cursorTo)
  const insertLeg = useStore((s) => s.insertLeg)
  const setLegFacts = useStore((s) => s.setLegFacts)
  const paneMini = useStore((s) => s.paneMini)
  const setPaneMini = useStore((s) => s.setPaneMini)
  const [data, setData] = useState<RouteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // the modes switched on on the map, so the trip pane lists the same places the map lights
  const [families, setFamilies] = useState<Set<Family> | null>(null)
  // a map mode owns taps on the map, so they leave the trip pane as it was
  const [modeOn, setModeOn] = useState(false)
  const model =useMemo(() => (data ? buildModel(data) : null), [data])

  useEffect(() => {
    loadRouteData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  const trips = useMemo(() => toTripState(journey, saved, mapOpen, inout), [journey, saved, mapOpen, inout])
  const facts = useMemo(() => (data ? legFactsFrom(data.connections) : undefined), [data])
  useEffect(() => {
    if (facts) setLegFacts(facts)
  }, [facts, setLegFacts])
  const focusAt = idle ? false : journey && cursor != null ? journey.places[cursor]?.node ?? null : null
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
  const hasPane = mapOpen && !!journey
  // a tap on the map itself, beside the pane, folds the pane to its small card. It runs on the click, before
  // the map's own handler, so a tap on one of the trip's stops can keep the pane open in the same event
  const fold = (e: MouseEvent) => {
    if (hasPane && !paneMini && !modeOn && (e.target as Element).closest('.rmap-canvas')) setPaneMini(true)
  }
  const onStop = (id: string) => {
    cursorTo(id)
    setPaneMini(false)
  }
  return data ? (
    <div className="mapwrap" onClickCapture={fold}>
      <RouteMap
        data={data}
        trips={trips}
        onTrips={onTrips}
        fitTripOnLoad
        focus={hasPane}
        focusAt={focusAt}
        onStop={onStop}
        onLeg={insertLeg}
        onFamilies={setFamilies}
        onMode={setModeOn}
        side={hasPane ? <MapSide reach={model && families ? { model, families } : null} /> : null}
        sideWidth={hasPane && paneMini ? 236 : 360}
        sideMini={hasPane && paneMini}
      />
    </div>
  ) : (
    <div className="loading">Loading routes…</div>
  )
}
