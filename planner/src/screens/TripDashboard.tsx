import { lazy, Suspense, useState } from 'react'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { lockedLegs, wayBooking } from '../lib/booked'
import { routeStops } from '../lib/bundle'
import { dayRange } from '../lib/format'
import { totals, type Journey } from '../lib/journey'
import { useSchedule } from '../lib/useSchedule'
import { CostStrip } from '../components/CostStrip'
import { Caret, Download, Pin, Warn } from '../components/icons'
import { Modal } from '../components/Modal'
import { Notice } from '../components/Notice'
import { Story } from '../components/story/Story'
import { TripHead } from '../components/story/TripHead'
import { VersionMenu } from '../components/VersionMenu'

const RouteSummary = lazy(() => import('../components/story/RouteSummary'))

// The dashboard of one trip: its costs and a small map of it on top, then the route as a story down
// a rail, from Copenhagen and back. The small map opens the whole one, details rest behind a hover
// or a click.

export function TripDashboard({ data, journey }: { data: AppData; journey: Journey }) {
  const { inout, map } = data
  const saved = useStore((s) => s.saved)
  const openSaved = useStore((s) => s.openSaved)
  const saveJourney = useStore((s) => s.saveJourney)
  const go = useStore((s) => s.go)
  const changeEndsOf = useStore((s) => s.changeEndsOf)
  const bookings = useStore((s) => s.bookings)
  const lodgings = useStore((s) => s.lodgings)
  const [onMap, setOnMap] = useState(false)

  const wi = inout.ways[journey.wayIn]
  const wh = inout.ways[journey.wayHome]
  const plan = useSchedule(data, journey)
  const stored = saved.find((s) => s.id === journey.id)
  const dirty = !stored || JSON.stringify({ ...stored, savedAt: 0 }) !== JSON.stringify({ ...journey, savedAt: 0 })
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(journey, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${journey.name.replace(/[^\w-]+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  if (!wi || !wh || !plan) {
    return (
      <div className="dash">
        <div className="row dash-head">
          <button className="btn link small" onClick={() => go('trips', 'home')}><Caret dir="l" />Trips</button>
          <h2 className="h2">{journey.name}</h2>
        </div>
        <div className="card pad empty">Its flights are no longer in the data. <button className="btn small" onClick={() => changeEndsOf(journey.id)}>Pick in and out</button></div>
      </div>
    )
  }

  const { sched } = plan
  const t = totals(data, journey, sched, bookings, lodgings)
  // a warning about one leg or one stop sits on that leg or stop
  const general = sched.warnings.filter((w) => w.leg == null && w.stop == null)
  // the map tells a booked leg from a planned one
  const stops = routeStops(map, journey, sched, lockedLegs(bookings, data, journey, sched))

  return (
    <div className="dash">
      <div className="row dash-head">
        <button className="btn link small" onClick={() => go('trips', 'home')}><Caret dir="l" />Trips</button>
        <h2 className="h2">{journey.name}</h2>
        {journey.rank != null && <span className="rank" title="Rank among the planned trips">#{journey.rank}</span>}
        {journey.version != null && <VersionMenu id={journey.id} version={journey.version} />}
        <span className="spacer" />
        {stops.length > 0 && <button className="btn small" onClick={() => setOnMap(true)}>View on map</button>}
        <button className="btn small" onClick={() => openSaved(journey)}><Pin />Build on the map</button>
        <button className={`btn small${dirty ? ' primary' : ''}`} onClick={() => saveJourney(journey.name)} disabled={!dirty}>{dirty ? 'Save trip' : 'Saved'}</button>
        <button className="btn link small" onClick={exportJson}><Download />Export JSON</button>
      </div>

      <Notice />

      {general.length > 0 && (
        <ul className="dash-warn">
          {general.map((w, i) => (
            <li key={i} className={w.level}>
              <Warn />{w.text}
            </li>
          ))}
        </ul>
      )}

      <section className="card pad dash-route" aria-label="Route">
        <TripHead
          count={journey.places.length}
          costs={<CostStrip t={t} />}
          map={stops.length > 0 && (
            <button type="button" className="rs-strip" aria-label="View on map" onClick={() => setOnMap(true)}>
              <Suspense fallback={null}><RouteSummary stops={stops} tilted /></Suspense>
            </button>
          )}
        />
        <Story data={data} journey={journey} sched={sched} wayIn={wi} wayHome={wh} />
      </section>

      {onMap && (
        <Modal label={`${journey.name} on the map`} className="rs-md" onClose={() => setOnMap(false)}>
          {() => (
            <Suspense fallback={<div className="rs-wait" />}>
              <RouteSummary
                stops={stops}
                title={journey.name}
                dates={dayRange(sched.firstDay, sched.homeDepart)}
                from={inout.airports[wi.from]?.name ?? wi.from}
                to={inout.airports[wh.to]?.name ?? wh.to}
                inBooked={!!wayBooking(bookings, data, wi)}
              />
            </Suspense>
          )}
        </Modal>
      )}
    </div>
  )
}
