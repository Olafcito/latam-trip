import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { lockedLegs, wayBooking } from '../lib/booked'
import { routeStops } from '../lib/bundle'
import { dayRange, shortPlace } from '../lib/format'
import { nodeName, totals, type Journey } from '../lib/journey'
import { rowToJourney, sameJourney } from '../lib/repoTrips'
import { costItems, costParts, nowIn, ticketSplit, tripLegs, type LegKey } from '../lib/tripStatus'
import { timed } from '../lib/fares'
import { useSchedule } from '../lib/useSchedule'
import { Caret, Dots, Download, Pin, Warn } from '../components/icons'
import { Modal } from '../components/Modal'
import { Notice } from '../components/Notice'
import { Story } from '../components/story/Story'
import { TripStatus, type NowView } from '../components/story/TripStatus'
import { showLeg } from '../components/story/showLeg'
import { usePop } from '../components/story/usePop'
import { VersionMenu } from '../components/VersionMenu'

const RouteSummary = lazy(() => import('../components/story/RouteSummary'))

// The page of one trip: where it stands and a small map of it on top, then the route as a story down a
// rail, from Copenhagen and back. The small map opens the whole one, the cost opens all costs, the open
// count takes you to the next leg to book.

/** The day it is where you are, or in development the day of a today parameter, to see the trip as it will be. */
function todayOf(): string {
  const q = import.meta.env.DEV ? new URLSearchParams(window.location.search).get('today') : null
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q
  return new Date().toLocaleDateString('sv-SE')
}

/** The rarer actions of a trip behind one button. */
function TripMenu({ onBuild, onExport }: { onBuild: () => void; onExport: () => void }) {
  const pop = usePop(false)
  const run = (fn: () => void) => () => { pop.close(); fn() }
  return (
    <span className="pop-wrap" {...pop.wrap}>
      <button type="button" className="btn small icon tm-btn" aria-label="More for this trip" title="More" aria-haspopup="menu" {...pop.trigger}><Dots /></button>
      {pop.open && (
        <div className="pop tm" role="menu" aria-label="More for this trip" {...pop.panel}>
          <button type="button" role="menuitem" className="tm-item" onClick={run(onBuild)}><Pin />Build on the map</button>
          <button type="button" role="menuitem" className="tm-item" onClick={run(onExport)}><Download />Export JSON</button>
        </div>
      )}
    </span>
  )
}

export function TripDashboard({ data, journey }: { data: AppData; journey: Journey }) {
  const { inout, map } = data
  const saved = useStore((s) => s.saved)
  const row = useStore((s) => s.rows[journey.id])
  const repo = useStore((s) => s.repo)
  const openSaved = useStore((s) => s.openSaved)
  const saveJourney = useStore((s) => s.saveJourney)
  const go = useStore((s) => s.go)
  const changeEndsOf = useStore((s) => s.changeEndsOf)
  const bookings = useStore((s) => s.bookings)
  const lodgings = useStore((s) => s.lodgings)
  const [onMap, setOnMap] = useState(false)
  const [today] = useState(todayOf)

  const wi = inout.ways[journey.wayIn]
  const wh = inout.ways[journey.wayHome]
  const plan = useSchedule(data, journey)
  // a trip of the table is saved when it is the same as its row, a trip of the browser when it is the same as its copy
  const base = row ? rowToJourney(row) : saved.find((s) => s.id === journey.id) ?? repo.find((r) => r.id === journey.id)
  const dirty = !base || !sameJourney(base, journey)
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(journey, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${journey.name.replace(/[^\w-]+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const sched = plan?.sched
  const status = useMemo(() => {
    if (!wi || !wh || !sched) return null
    const t = totals(data, journey, sched, bookings, lodgings)
    const legs = tripLegs(data, journey, sched, wi, wh, bookings)
    const tickets = ticketSplit(inout, legs, wi, wh)
    const nm = (id: string) => shortPlace(nodeName(map, inout, id))
    const port = (code: string) => shortPlace(inout.airports[code]?.name ?? code)
    const route = (k: LegKey, from: string, to: string) => (typeof k === 'number' ? `${nm(from)} to ${nm(to)}` : `${port(from)} to ${port(to)}`)
    const n = nowIn(sched, legs, { start: wi.depart.slice(0, 10), end: wh.arrive.slice(0, 10) }, today)
    let now: NowView | null = null
    if (n) {
      const next = n.next == null ? null : legs.find((l) => l.key === n.next) ?? null
      const at = (l: typeof next) => {
        if (!l) return null
        if (l.key === 'in') return wi.depart
        if (l.key === 'home') return wh.depart
        const f = journey.places[l.key]?.hop?.flight
        return f && timed(f) && f.depart.slice(0, 10) === l.day ? f.depart : null
      }
      now = {
        place: n.at === 'free' ? 'Free nights' : n.at == null ? null : nm(sched.places[n.at].node),
        nightsLeft: n.nightsLeft,
        next: next && { key: next.key, fam: next.fam, route: route(next.key, next.from, next.to), day: next.day, time: at(next), booked: next.booked },
      }
    }
    return {
      legs, now, at: n?.at ?? null,
      parts: costParts({ legs, tickets, t }),
      items: costItems(legs, tickets, (l) => route(l.key, l.from, l.to)),
    }
  }, [data, inout, map, journey, sched, wi, wh, bookings, lodgings, today])

  // during the trip the page opens on today
  const at = status?.at
  useEffect(() => {
    if (at == null) return
    const el = document.getElementById(at === 'free' ? 'st-free' : `st-${at}`)
    el?.scrollIntoView({ block: 'center' })
  }, [journey.id, at != null])

  if (!wi || !wh || !plan || !sched || !status) {
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
        {dirty && <button className="btn small" onClick={() => saveJourney(journey.name)}>Save trip</button>}
        <TripMenu onBuild={() => openSaved(journey)} onExport={exportJson} />
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
        <header className="tg">
          <TripStatus
            nights={sched.totalDays} first={sched.firstDay} last={sched.homeDepart.slice(0, 10)}
            legs={status.legs} parts={status.parts} items={status.items} now={status.now} onGo={showLeg}
          />
          {stops.length > 0 && (
            <button type="button" className="rs-strip" aria-label="View on map" onClick={() => setOnMap(true)}>
              <Suspense fallback={null}><RouteSummary stops={stops} tilted /></Suspense>
            </button>
          )}
        </header>
        <Story data={data} journey={journey} sched={sched} wayIn={wi} wayHome={wh} today={today} />
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
