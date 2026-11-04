import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import type { StopDays } from '@map/map/Panel'
import { RouteMap } from '@map/map/RouteMap'
import { buildModel } from '@map/data/model'
import type { TripState } from '@map/data/trips'
import type { Family, MapData as RouteData } from '@map/data/types'
import { loadRouteData } from '../data/routeMap'
import { useDataRev } from '../data/rev'
import { legFactsFrom, toTripState } from '../lib/mapTrips'
import { useSchedule } from '../lib/useSchedule'
import { useStore } from '../store'
import { Plus } from './icons'
import { AddPlace } from './stays/AddPlace'
import { StayCard } from './stays/StayCard'
import { WhereToStay } from './stays/WhereToStay'
import { MapSide } from './TripPanel'

/**
 * Where to stay at a city on the map. A city the open trip stops at gets the stop's Where to stay, priced for
 * its nights. Any other city, or any city with no trip open, lists its places to stay without prices.
 */
function CityStays({ placeId }: { placeId: string }) {
  const data = useStore((s) => s.data)
  const journey = useStore((s) => s.journey)
  const mapOpen = useStore((s) => s.mapOpen)
  const lodgings = useStore((s) => s.lodgings)
  const [adding, setAdding] = useState(false)
  const j = mapOpen ? journey : null
  const sched = useSchedule(data, j)?.sched ?? null
  const stops = j && sched ? j.places.flatMap((p, i) => (p.node === placeId && sched.places[i] ? [i] : [])) : []
  if (sched && stops.length) return <>{stops.map((i) => <WhereToStay key={i} i={i} sched={sched} />)}</>

  const here = lodgings.filter((l) => l.place_id === placeId && !l.hidden)
  return (
    <section className="ws" aria-labelledby={`ws-h-${placeId}`}>
      <header className="ws-head"><h4 id={`ws-h-${placeId}`}>Where to stay</h4></header>
      {here.length > 0 && <div className="ws-cards">{here.map((l) => <StayCard key={l.id} lodging={l} first={null} />)}</div>}
      {adding ? (
        <AddPlace place={placeId} close={() => setAdding(false)} onSaved={() => setAdding(false)} />
      ) : (
        <button type="button" className="ws-add" onClick={() => setAdding(true)}><Plus />Add a place</button>
      )}
    </section>
  )
}

/**
 * The city panel's stays block. Its key differs from the city id, since the panel keys its own places by that id
 * among the same children, and two children with one key make React warn.
 */
export const cityStays = (placeId: string) => <CityStays key={`stays:${placeId}`} placeId={placeId} />

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
  const mapCard = useStore((s) => s.mapCard)
  const clearMapCard = useStore((s) => s.clearMapCard)
  const mapCardFrom = useStore((s) => s.mapCardFrom)
  const go = useStore((s) => s.go)
  const [data, setData] = useState<RouteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // the modes switched on on the map, so the trip pane lists the same places the map lights
  const [families, setFamilies] = useState<Set<Family> | null>(null)
  // a map mode owns taps on the map, so they leave the trip pane as it was
  const [modeOn, setModeOn] = useState(false)
  // the tap that opens a map panel also folds the pane, so the pane comes back when that panel closes
  const tapFolded = useRef(false)
  const unfoldLater = useRef(false)
  const onPanel = useCallback(
    (open: boolean) => {
      if (!open && unfoldLater.current) setPaneMini(false)
      unfoldLater.current = open && tapFolded.current
    },
    [setPaneMini],
  )
  const model = useMemo(() => (data ? buildModel(data) : null), [data])
  const appData = useStore((s) => s.data)
  const sched = useSchedule(appData, mapOpen ? journey : null)?.sched ?? null
  // a stop's nights and dates for the map's city panel, from its first visit in the open trip
  const stopDays = useCallback(
    (placeId: string): StopDays | null => {
      if (!journey || !sched) return null
      const at = sched.places[journey.places.findIndex((p, i) => p.node === placeId && sched.places[i])]
      return at ? { nights: at.days, inDay: at.inDay, outDay: at.outDay, exact: at.exact } : null
    },
    [journey, sched],
  )

  const rev = useDataRev()
  useEffect(() => {
    loadRouteData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [rev])

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
    if (!(e.target as Element).closest('.rmap-canvas')) return
    tapFolded.current = hasPane && !paneMini && !modeOn
    if (tapFolded.current) setPaneMini(true)
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
        onPanel={onPanel}
        card={mapCard}
        onCardOpen={clearMapCard}
        cardFrom={mapCardFrom && { card: mapCardFrom, label: 'Trips', onBack: () => go('trips') }}
        side={hasPane ? <MapSide reach={model && families ? { model, families } : null} /> : null}
        sideWidth={hasPane && paneMini ? 236 : 360}
        sideMini={hasPane && paneMini}
        stays={cityStays}
        stopDays={stopDays}
      />
    </div>
  ) : (
    <div className="loading">Loading routes…</div>
  )
}
