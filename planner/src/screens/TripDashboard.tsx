import { useState } from 'react'
import type { AppData, InOut, Way } from '../data/types'
import { useStore } from '../store'
import { clock, day, hours, kr } from '../lib/format'
import { nodeForAirport, nodeName, schedule, totals, type Journey } from '../lib/journey'
import { flightLegs, tripRoute, type RouteLeg } from '../lib/route'
import { WayTrack } from '../components/WayCard'
import { TotalsPanel } from '../components/TotalsPanel'
import { MiniMap } from '../components/MiniMap'
import { Chevron, DisclosurePanel, useDisclosure } from '../components/Disclosure'
import { FlyOnChips, RouteLine } from '../components/RouteLine'
import { LegPrices } from '../components/LegPrices'
import { FlightLinks } from '../components/FlightLinks'
import { wayLinks } from '../lib/links'
import { Download, Home, Land, Pin, Transfer, Warn } from '../components/icons'
import { Story } from '../components/story/Story'

// The dashboard of one trip. Calm by default: the route as flags with the all-in price and the
// day each flight leaves, then the route as a story down a rail, stops and the legs between them.
// Details rest behind a hover or a click.


/** One long-haul way on one line: direction, from and to, departure and duration. Opens to its track. */
function WayRow({ way, other, inout, dir }: { way: Way; other: Way; inout: InOut; dir: 'in' | 'home' }) {
  const d = useDisclosure()
  const far = dir === 'in' ? way.to : way.from
  const city = inout.airports[far]?.name ?? far
  const [from, to] = dir === 'in' ? ['Copenhagen', city] : [city, 'Copenhagen']
  const xfer = way.timeline.flatMap((t) => (t.kind === 'self_transfer' ? [t.airport] : []))
  const carriers = [...new Set(way.timeline.flatMap((t) => (t.kind === 'flight' ? t.carriers : [])))]
  const own = way.shared_ticket ? null : way.price_dkk
  return (
    <div className={`cph ${dir}`}>
      <button className="disc-btn cph-row" {...d.trigger}>
        <span className="cph-dir" title={dir === 'in' ? 'Way in' : 'Way home'}>{dir === 'in' ? <Land s={15} /> : <Home s={15} />}</span>
        <span className="cph-route">{from} to {to}</span>
        <span className="cph-meta">
          {xfer.length > 0 && <span className="cph-warn" title={`Self-transfer in ${xfer.join(', ')}`}><Transfer /></span>}
          {way.us_transit && <span className="cph-warn" title="Passes through the United States, ESTA needed">US</span>}
          <span>{day(way.depart)} {clock(way.depart)}</span>
          <span className="cph-dur">{hours(way.total_hours)}</span>
          <Chevron open={d.open} />
        </span>
      </button>
      <DisclosurePanel {...d.panel}>
        <div className="cph-more">
          <WayTrack way={way} airports={inout.airports} compact />
          <p>
            {way.flights} {way.flights === 1 ? 'flight' : 'flights'} · {hours(way.flying_hours)} in the air
            {carriers.length > 0 && ` · ${carriers.join(', ')}`}
            {' · '}{own != null ? kr(own) : 'On the return ticket'}
          </p>
          <FlightLinks links={wayLinks(way, inout, other)} />
        </div>
      </DisclosurePanel>
    </div>
  )
}

export function TripDashboard({ data, journey }: { data: AppData; journey: Journey }) {
  const { inout, map } = data
  const saved = useStore((s) => s.saved)
  const openSaved = useStore((s) => s.openSaved)
  const saveJourney = useStore((s) => s.saveJourney)
  const go = useStore((s) => s.go)
  // the leg picked in the hero. Its known prices on its day show under the chips.
  const [leg, setLeg] = useState<string | null>(null)
  const pickLeg = (l: RouteLeg) => setLeg((k) => (k === l.key ? null : l.key))

  const wi = inout.ways[journey.wayIn]
  const wh = inout.ways[journey.wayHome]
  const nm = (id: string) => nodeName(map, inout, id)
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

  if (!wi || !wh) {
    return (
      <div className="dash">
        <div className="row dash-head">
          <button className="btn link small" onClick={() => go('trips', 'home')}>‹ Trips</button>
          <h2 className="h2">{journey.name}</h2>
        </div>
        <div className="card pad empty">Its flights are no longer in the data. <button className="btn small" onClick={() => go('trips', 'pick')}>Pick in and out</button></div>
      </div>
    )
  }

  const exitNode = nodeForAirport(inout, wh.from)
  const sched = schedule(journey, wi, wh, exitNode, nm)
  const t = totals(data, journey, sched)
  const allIn = t.tickets_dkk + t.regional_flights_dkk + t.ground_dkk + (t.hub_stay_dkk ?? 0) + (t.cabin_bag_dkk ?? 0)
  const route = tripRoute(data, journey)
  const partial = t.ground_unknown > 0 || t.hub_stay_dkk == null
  const picked = route && leg ? flightLegs(route).find((l) => l.key === leg) ?? null : null

  return (
    <div className="dash">
      <div className="row dash-head">
        <button className="btn link small" onClick={() => go('trips', 'home')}>‹ Trips</button>
        <h2 className="h2">{journey.name}</h2>
        {journey.rank != null && <span className="rank" title="Rank among the planned trips">#{journey.rank}</span>}
        {dirty && <span className="pill draft">Not saved</span>}
        <span className="spacer" />
        <button className="btn primary small" onClick={() => openSaved(journey)}><Pin />Build on the map</button>
        <button className="btn small" onClick={() => saveJourney(journey.name)} disabled={!dirty}>{dirty ? 'Save trip' : 'Saved'}</button>
        <button className="btn link small" onClick={exportJson}><Download />Export JSON</button>
      </div>

      <div className="card dash-hero">
        <div className="th">
          <div className="th-route">{route && <RouteLine route={route} size="hero" />}</div>
          <div className="th-price">
            <span className="th-big">
              {kr(allIn).replace(/ kr$/, '')}<span className="th-kr"> kr</span>
              {partial && <span className="th-q" title="Some legs have no price yet, so this is a floor">+?<span className="sr"> plus unpriced legs</span></span>}
            </span>
            <span className="th-sub">all in</span>
          </div>
          {route && (
            <div className="th-legs">
              <span className="th-lab" id="fly-on">Fly on</span>
              <FlyOnChips legs={flightLegs(route)} pickedLeg={leg} onPickLeg={pickLeg} labelledBy="fly-on" />
            </div>
          )}
          {picked && <LegPrices key={picked.key} leg={picked} map={map} />}
        </div>
      </div>

      {sched.warnings.length > 0 && (
        <ul className="dash-warn">
          {sched.warnings.map((w, i) => <li key={i} className={w.level}><Warn />{w.text}</li>)}
        </ul>
      )}

      <div className="dash-grid">
        <section className="card pad dash-route" aria-label="Route">
          <h3 className="h3">Route</h3>
          <Story data={data} journey={journey} sched={sched} wayIn={wi} wayHome={wh} />
        </section>

        <div className="dash-side">
          <section className="card pad" aria-label="Flights in and home">
            <h3 className="h3">Copenhagen and back</h3>
            <div className="ways">
              <WayRow way={wi} other={wh} inout={inout} dir="in" />
              <WayRow way={wh} other={wi} inout={inout} dir="home" />
            </div>
          </section>
          <section className="card pad" aria-label="Costs">
            <h3 className="h3">Costs</h3>
            <TotalsPanel t={t} total={allIn} />
          </section>
          <section className="card pad" aria-label="Map">
            <MiniMap data={inout} ways={[wi, wh]} onOpen={() => openSaved(journey)} />
          </section>
        </div>
      </div>
    </div>
  )
}
