import { Fragment, useState } from 'react'
import type { Family } from '@map/data/types'
import { TRIP_COLORS } from '@map/data/trips'
import { Flag } from '@map/map/Flag'
import type { AppData, InOut, MapNode, Way } from '../data/types'
import { useStore } from '../store'
import { clock, day, hours, kr, weekdayDay } from '../lib/format'
import { nodeForAirport, nodeName, schedule, totals, type Hop, type Journey, type ScheduledPlace } from '../lib/journey'
import { countryName } from '../lib/colors'
import { flightLegs, tripRoute, type RouteLeg } from '../lib/route'
import { WayTrack } from '../components/WayCard'
import { TotalsPanel } from '../components/TotalsPanel'
import { MiniMap } from '../components/MiniMap'
import { hoverProps } from '../components/PlaceCard'
import { Chevron, DisclosurePanel, useDisclosure } from '../components/Disclosure'
import { FlyOnChips, RouteLine } from '../components/RouteLine'
import { LegPrices } from '../components/LegPrices'
import { Download, Home, Land, ModeChip, Moon, Pin, Transfer, Warn } from '../components/icons'

// The dashboard of one trip. Calm by default: the route as flags with the all-in price and the
// rough day each flight leaves, then the stops and legs. Everything else opens on a click.

const family = (mode: string): Family => (mode === 'flight' ? 'flight' : mode === 'boat' ? 'boat' : 'ground')
const MODE_NAME: Record<Family, string> = { flight: 'Flight', boat: 'Boat', ground: 'Ground' }

/** A stop: number, flag and city. Opens to its country, dates and description. */
function StopRow({ i, name, node, country, sp }: { i: number; name: string; node: MapNode | undefined; country: string; sp: ScheduledPlace }) {
  const d = useDisclosure()
  const dates = [sp.arrive && weekdayDay(sp.arrive), sp.depart && weekdayDay(sp.depart)].filter(Boolean).join(' to ')
  return (
    <li className="tl-stop">
      <button className="disc-btn tl-row" {...d.trigger}>
        <span className="tl-n" style={{ background: TRIP_COLORS[0] }}>{i + 1}</span>
        <Flag code={country} size={13} title={countryName(country)} />
        <b className="tl-name" {...hoverProps(node)}>{name}</b>
        <Chevron open={d.open} />
      </button>
      <DisclosurePanel {...d.panel}>
        <div className="tl-more">
          <span>{countryName(country)}{dates ? ` · ${dates}` : ''}</span>
          {node?.profile?.tagline && <p>{node.profile.tagline}</p>}
        </div>
      </DisclosurePanel>
    </li>
  )
}

/** A leg between stops: mode, duration and price. Opens to carrier, times and via. */
function HopRow({ h }: { h: Hop }) {
  const d = useDisclosure()
  const fam = family(h.mode)
  const f = h.flight
  const details = [
    h.overland ?? (h.operator || null),
    f ? `${weekdayDay(f.depart)} ${clock(f.depart)} to ${clock(f.arrive)}` : null,
    f?.via.length ? `Via ${f.via.join(', ')}` : null,
    h.overnight ? 'Overnight' : null,
    h.border ? 'Crosses a border' : null,
  ].filter((x): x is string => !!x)
  const unpriced = h.overland && h.hours == null && h.price_dkk == null
  const body = (
    <>
      <span className="tl-mode" role="img" aria-label={MODE_NAME[fam]} title={MODE_NAME[fam]}><ModeChip family={fam} /></span>
      {unpriced ? <span className="tl-hopt">Overland</span> : (
        <span className="tl-hopt">
          <span>{hours(h.hours)}</span>
          <span className="tl-price">{kr(h.price_dkk)}</span>
        </span>
      )}
      {h.overnight && <span className="tl-ico" title="Overnight"><Moon /></span>}
    </>
  )
  if (!details.length) return <li className={`tl-hop ${fam}`}><div className="tl-row">{body}</div></li>
  return (
    <li className={`tl-hop ${fam}`}>
      <button className="disc-btn tl-row" {...d.trigger}>
        {body}
        <Chevron open={d.open} />
      </button>
      <DisclosurePanel {...d.panel}>
        <ul className="tl-more">{details.map((x) => <li key={x}>{x}</li>)}</ul>
      </DisclosurePanel>
    </li>
  )
}

/** One long-haul way on one line: direction, from and to, departure and duration. Opens to its track. */
function WayRow({ way, inout, dir }: { way: Way; inout: InOut; dir: 'in' | 'home' }) {
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
  const node = (id: string) => map.nodes.find((n) => n.id === id)
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
  const countryOf = (id: string) => node(id)?.country ?? inout.airports[id]?.country ?? ''
  const route = tripRoute(data, journey)
  const partial = t.ground_unknown > 0 || t.hub_stay_dkk == null
  const picked = route && leg ? flightLegs(route).find((l) => l.key === leg) ?? null : null

  return (
    <div className="dash">
      <div className="row dash-head">
        <button className="btn link small" onClick={() => go('trips', 'home')}>‹ Trips</button>
        <h2 className="h2">{journey.name}</h2>
        {journey.rank != null && <span className="rank" title="Rank among the seeded trips">#{journey.rank}</span>}
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
          <ol className="tl">
            <li className="tl-way in">
              <span className="io-dot in" />
              <b>Lands {nm(nodeForAirport(inout, wi.to))}</b>
              <small>{weekdayDay(wi.arrive)} {clock(wi.arrive)}</small>
            </li>
            {journey.places.map((p, i) => (
              <Fragment key={i}>
                {p.hop && <HopRow h={p.hop} />}
                <StopRow i={i} name={nm(p.node)} node={node(p.node)} country={countryOf(p.node)} sp={sched.places[i]} />
              </Fragment>
            ))}
            <li className="tl-way home">
              <span className="io-dot home" />
              <b>Flies home from {nm(exitNode)}</b>
              <small>{weekdayDay(wh.depart)} {clock(wh.depart)}</small>
            </li>
          </ol>
        </section>

        <div className="dash-side">
          <section className="card pad" aria-label="Flights in and home">
            <h3 className="h3">Copenhagen and back</h3>
            <div className="ways">
              <WayRow way={wi} inout={inout} dir="in" />
              <WayRow way={wh} inout={inout} dir="home" />
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
