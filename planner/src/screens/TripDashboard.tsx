import { Fragment, type CSSProperties } from 'react'
import type { Family } from '@map/data/types'
import { TRIP_COLORS } from '@map/data/trips'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { clock, hours, kr, weekdayDay } from '../lib/format'
import { nodeForAirport, nodeName, schedule, totals, type Journey } from '../lib/journey'
import { countryColor, countryName } from '../lib/colors'
import { WayCard } from '../components/WayCard'
import { TotalsPanel } from '../components/TotalsPanel'
import { MiniMap } from '../components/MiniMap'
import { hoverProps } from '../components/PlaceCard'
import { Download, Land, ModeChip, Moon, Pin, Warn } from '../components/icons'

// The dashboard of one trip: everything about it on one page, the route as a timeline between
// its two fixed flights, the ways as pictures, the costs, and the days per country.

const family = (mode: string): Family => (mode === 'flight' ? 'flight' : mode === 'boat' ? 'boat' : 'ground')

function Fact({ v, k, big }: { v: string; k: string; big?: boolean }) {
  return (
    <span className={big ? 'big' : ''}>
      <b>{v}</b>
      <small>{k}</small>
    </span>
  )
}

export function TripDashboard({ data, journey }: { data: AppData; journey: Journey }) {
  const { inout, map } = data
  const saved = useStore((s) => s.saved)
  const openSaved = useStore((s) => s.openSaved)
  const saveJourney = useStore((s) => s.saveJourney)
  const go = useStore((s) => s.go)

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
  const countries = Object.entries(t.days_per_country).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  const daysAll = countries.reduce((a, [, n]) => a + n, 0)
  const countryOf = (id: string) => node(id)?.country ?? inout.airports[id]?.country ?? ''

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
        <Fact v={kr(allIn)} k="all in" big />
        <Fact v={`${weekdayDay(wi.arrive)} ${clock(wi.arrive)}`} k={`lands ${nm(nodeForAirport(inout, wi.to))}`} />
        <Fact v={`${weekdayDay(wh.depart)} ${clock(wh.depart)}`} k={`flies home from ${nm(exitNode)}`} />
        <Fact v={String(sched.totalDays)} k="days there" />
        <Fact v={String(journey.places.length)} k={journey.places.length === 1 ? 'stop' : 'stops'} />
        <Fact v={String(t.flights)} k="flights" />
        <Fact v={hours(t.air_hours)} k="in the air" />
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
              <div>
                <b>Lands {nm(nodeForAirport(inout, wi.to))}</b>
                <small>{weekdayDay(wi.arrive)} {clock(wi.arrive)} · {hours(wi.total_hours)} from Copenhagen · {wi.airports.join(' › ')}</small>
              </div>
            </li>
            {journey.places.map((p, i) => {
              const n = node(p.node)
              const h = p.hop
              const sp = sched.places[i]
              const c = countryOf(p.node)
              return (
                <Fragment key={i}>
                  {h && (
                    <li className={`tl-hop ${family(h.mode)}`}>
                      <ModeChip family={family(h.mode)} />
                      <span className="tl-hopt">
                        {h.overland ? h.overland : <>{h.operator ? `${h.operator} · ` : ''}{hours(h.hours)} · {kr(h.price_dkk)}</>}
                        {h.flight ? ` · ${weekdayDay(h.flight.depart)} ${clock(h.flight.depart)} to ${clock(h.flight.arrive)}` : ''}
                        {h.flight?.via.length ? ` · via ${h.flight.via.join(', ')}` : ''}
                      </span>
                      {h.overnight && <Moon />}
                      {h.border && <span className="plan-border" title="Crosses a border">border</span>}
                    </li>
                  )}
                  <li className="tl-stop" style={{ '--c': countryColor(c) } as CSSProperties}>
                    <span className="tl-n" style={{ background: TRIP_COLORS[0] }}>{i + 1}</span>
                    <div className="tl-who">
                      <b {...hoverProps(n)}>{nm(p.node)}</b>
                      <small><i style={{ background: countryColor(c) }} />{countryName(c)}{n?.profile?.tagline ? ` · ${n.profile.tagline}` : ''}</small>
                    </div>
                    <div className="tl-days" title="Days shared evenly between the dated flights around this stop">
                      <b>{sp.days}</b><small>{sp.days === 1 ? 'day' : 'days'}</small>
                    </div>
                    <div className="tl-dates">
                      {sp.arrive && <span title="A dated flight brings you here">{weekdayDay(sp.arrive)}</span>}
                      {sp.depart && <span title="A dated flight takes you on">to {weekdayDay(sp.depart)}</span>}
                    </div>
                  </li>
                </Fragment>
              )
            })}
            <li className="tl-way home">
              <span className="io-dot home" />
              <div>
                <b>Flies home from {nm(exitNode)}</b>
                <small>{weekdayDay(wh.depart)} {clock(wh.depart)} · {hours(wh.total_hours)} · {wh.airports.join(' › ')}</small>
              </div>
              <Land />
            </li>
          </ol>
        </section>

        <div className="dash-side">
          <section className="card pad" aria-label="Flights in and home">
            <h3 className="h3">Copenhagen and back</h3>
            <div className="ways">
              <WayCard way={wi} inout={inout} dir="in" compact />
              <WayCard way={wh} inout={inout} dir="home" compact />
            </div>
          </section>
          <section className="card pad" aria-label="Costs">
            <h3 className="h3">Costs</h3>
            <TotalsPanel t={t} compact />
          </section>
          {countries.length > 0 && (
            <section className="card pad" aria-label="Days per country">
              <h3 className="h3">Days per country</h3>
              <div className="bar" role="img" aria-label={countries.map(([c, n]) => `${countryName(c)} ${n}`).join(', ')}>
                {countries.map(([c, n]) => <i key={c} style={{ flexGrow: n, background: countryColor(c) }} title={`${countryName(c)}, ${n} ${n === 1 ? 'day' : 'days'}`} />)}
              </div>
              <ul className="dash-legend">
                {countries.map(([c, n]) => <li key={c}><i style={{ background: countryColor(c) }} />{countryName(c)}<b>{n}</b><small>{daysAll ? Math.round((n / daysAll) * 100) : 0}%</small></li>)}
              </ul>
            </section>
          )}
          <section className="card pad" aria-label="Map">
            <MiniMap data={inout} ways={[wi, wh]} onOpen={() => openSaved(journey)} />
          </section>
        </div>
      </div>
    </div>
  )
}
