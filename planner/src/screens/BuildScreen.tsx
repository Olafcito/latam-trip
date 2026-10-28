import { useMemo, useState } from 'react'
import type { AppData, CrawledFlight, StopItem, Way } from '../data/types'
import { useStore } from '../store'
import { dayTime, day, hours, kr, STOP_LABEL } from '../lib/format'
import { arcsSorted, crawledFlights, edgeHours, edgePrice, shortestPath, type Arc, type PathMetric, type PathResult } from '../lib/graph'
import { hopFromArc, hubStops, nodeForAirport, nodeName, schedule, totals, type Journey, type Place } from '../lib/journey'
import { MODE_LABEL, MODE_SHORT, countryName } from '../lib/colors'
import { Calendar } from '../components/Calendar'
import { TotalsPanel } from '../components/TotalsPanel'
import { WayTimeline } from '../components/WayTimeline'
import { PlaceCard, hoverProps } from '../components/PlaceCard'

const Moon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Overnight"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" /></svg>
)
const Border = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Border crossing"><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
)

function HubChips({ way }: { way: Way }) {
  const stops = hubStops(way)
  if (!stops.length) return null
  return (
    <div>
      {stops.map((s: StopItem, i) => (
        <span key={i} className={'hubchip ' + s.kind}>
          {s.kind === 'night' && <Moon />}
          {STOP_LABEL[s.kind]} {s.airport} · {hours(s.hours)}{s.nights ? ` · stay est. ${kr(s.stay_estimate_dkk)}` : ''}
        </span>
      ))}
    </div>
  )
}

export function BuildScreen({ data, journey }: { data: AppData; journey: Journey }) {
  const { inout, map } = data
  const setJourney = useStore((s) => s.setJourney)
  const saveJourney = useStore((s) => s.saveJourney)
  const go = useStore((s) => s.go)
  const showOnMap = useStore((s) => s.showOnMap)
  const wi = inout.ways[journey.wayIn]
  const wh = inout.ways[journey.wayHome]
  const [showWay, setShowWay] = useState<'in' | 'home' | null>(null)
  const [openArc, setOpenArc] = useState<number | null>(null)
  const [route, setRoute] = useState<{ metric: PathMetric; res: PathResult | null } | null>(null)
  const [name, setName] = useState(journey.name)

  const exitNode = nodeForAirport(inout, wh.from)
  const nm = (id: string) => nodeName(map, inout, id)
  const node = (id: string) => map.nodes.find((n) => n.id === id)
  const sched = useMemo(() => schedule(journey, wi, wh, exitNode, nm), [journey, wi, wh, exitNode])
  const tot = useMemo(() => totals(data, journey, sched), [data, journey, sched])
  const last = journey.places[journey.places.length - 1]
  const arcs = useMemo(() => arcsSorted(map, last.node), [map, last.node])

  const update = (places: Place[]) => { setJourney({ ...journey, places }); setRoute(null); setOpenArc(null) }
  const setNights = (i: number, n: number) => update(journey.places.map((p, k) => (k === i ? { ...p, nights: Math.max(0, n) } : p)))
  const removeLast = () => journey.places.length > 1 && update(journey.places.slice(0, -1))
  const addArc = (arc: Arc, flight: CrawledFlight | null) => update([...journey.places, { node: arc.to, nights: 2, hop: hopFromArc(last.node, arc, flight) }])
  const runRoute = (metric: PathMetric) => setRoute({ metric, res: shortestPath(map, last.node, exitNode, metric) })
  const applyRoute = () => {
    if (!route?.res) return
    const added: Place[] = []
    let from = last.node
    for (const a of route.res.arcs) { added.push({ node: a.to, nights: 1, hop: hopFromArc(from, a, null) }); from = a.to }
    update([...journey.places, ...added])
  }
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(journey, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = (journey.name || 'journey').replace(/[^\w-]+/g, '_') + '.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="build">
      <PlaceCard />
      <div className="itin">
        <div className="card pad row" style={{ gap: 8 }}>
          <input className="name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Journey name" />
          <button className="btn primary small" onClick={() => saveJourney(name)}>Save</button>
          <button className="btn small" onClick={showOnMap}>Build on the map</button>
          <button className="btn small" onClick={exportJson}>Export JSON</button>
          <button className="btn small" onClick={() => go('trips', 'pick')}>Change in and out</button>
        </div>

        <div className="fixed in">
          <div className="row"><span className="lbl">Way in</span><span className="spacer" /><button className="btn link small" onClick={() => setShowWay(showWay === 'in' ? null : 'in')}>{showWay === 'in' ? 'Hide' : 'Timeline'}</button></div>
          <div className="main">Copenhagen to {inout.airports[wi.to]?.name ?? wi.to}, lands {dayTime(wi.arrive)}</div>
          <div className="sub">Leaves {dayTime(wi.depart)} · {hours(wi.total_hours)} door to door · {wi.flights} flights{wi.us_transit ? ' · US transit' : ''}</div>
          <HubChips way={wi} />
          {showWay === 'in' && <div style={{ marginTop: 10 }}><WayTimeline data={inout} way={wi} /></div>}
        </div>

        {journey.places.map((p, i) => {
          const sp = sched.places[i]
          const n = node(p.node)
          return (
            <div key={i} style={{ display: 'contents' }}>
              {p.hop && (
                <div className={'hop ' + p.hop.mode}>
                  <span className={'mi ' + p.hop.mode}>{MODE_SHORT[p.hop.mode] ?? ''}</span>
                  <span className="md">{p.hop.overland ? 'Overland' : MODE_LABEL[p.hop.mode] ?? p.hop.mode}</span>
                  <span>{hours(p.hop.hours)} · {kr(p.hop.price_dkk)}</span>
                  {p.hop.overnight && <Moon />}
                  {p.hop.border && <Border />}
                  <span className="faint small">{p.hop.flight ? `${dayTime(p.hop.flight.depart).slice(-5)} ${p.hop.flight.carriers.join(', ')}, price seen for ${day(p.hop.flight.depart)}` : p.hop.operator ?? ''}</span>
                </div>
              )}
              <div className="place">
                <div className="row">
                  <span className="nm" {...hoverProps(n)}>{nm(p.node)}<span className="cty">{n ? countryName(n.country) : ''}</span></span>
                  <span className="spacer" />
                  <div className="stepper" aria-label={`Nights in ${nm(p.node)}`}>
                    <button onClick={() => setNights(i, p.nights - 1)} aria-label="One night less">−</button>
                    <span>{p.nights} {p.nights === 1 ? 'night' : 'nights'}</span>
                    <button onClick={() => setNights(i, p.nights + 1)} aria-label="One night more">+</button>
                  </div>
                  {i > 0 && i === journey.places.length - 1 && <button className="btn link small" onClick={removeLast}>Remove</button>}
                </div>
                {sp && <div className="dates">Arrive {dayTime(sp.arrive)} · move on {day(sp.leaveDate)}</div>}
              </div>
            </div>
          )
        })}

        <div className="addhop">
          <div className="row">
            <h3 className="h3" style={{ margin: 0 }}>Next from {nm(last.node)}</h3>
            <span className="spacer" />
            <button className="btn small" onClick={() => runRoute('hours')}>Route to exit: fastest</button>
            <button className="btn small" onClick={() => runRoute('price')}>cheapest</button>
          </div>
          {route && (
            <div className="wn" style={{ marginTop: 8, background: '#eef2fc', color: '#1f3f86' }}>
              {route.res
                ? <>
                    {route.res.nodes.map(nm).join(' → ')} · {route.metric === 'hours' ? hours(route.res.cost) : kr(route.res.cost)}{' '}
                    <button className="btn small" style={{ marginLeft: 6 }} onClick={applyRoute}>Add these hops</button>
                  </>
                : `No route from ${nm(last.node)} to ${nm(exitNode)} in the data.`}
            </div>
          )}
          <div className="arcs">
            {arcs.map((a, k) => {
              const e = a.edge
              const fl = crawledFlights(e)
              const to = node(a.to)
              return (
                <div key={k}>
                  <button className="arc" onClick={() => (fl.length ? setOpenArc(openArc === k ? null : k) : addArc(a, null))} {...hoverProps(to)}>
                    <span className={'mi ' + e.mode}>{MODE_SHORT[e.mode] ?? ''}</span>
                    <span>
                      <span className="to">{nm(a.to)}</span> {e.overnight && <Moon />} {e.border && <Border />}
                      <span className="meta">{MODE_LABEL[e.mode] ?? e.mode} · {e.operator ?? e.carriers?.join(', ') ?? ''}{e.frequency ? ' · ' + e.frequency : ''}{fl.length ? ` · ${fl.length} crawled flights` : ''}</span>
                    </span>
                    <span className="num"><b>{hours(edgeHours(e))}</b><span className="small muted">{kr(edgePrice(e))}</span></span>
                  </button>
                  {openArc === k && (
                    <div className="flts">
                      {fl.map((f) => (
                        <button key={f.quote_id + f.depart} className="flt" onClick={() => addArc(a, f)}>
                          <span>{dayTime(f.depart)} to {dayTime(f.arrive)} · {f.carriers.join(', ')}{f.via.length ? ' via ' + f.via.join(', ') : ' nonstop'}<br /><span className="muted">price seen for {day(f.depart)}, {f.source ?? 'crawl'}{f.fare_brand ? ' · ' + f.fare_brand : ''}{f.layover_h.some((x) => x == null) ? ' · layover ?' : ''}</span></span>
                          <b>{kr(f.price_dkk)}<br /><span className="muted small">{hours(f.hours)}</span></b>
                        </button>
                      ))}
                      <button className="flt" onClick={() => addArc(a, null)}><span>Use the route without a specific flight</span><b>{kr(edgePrice(e))}</b></button>
                    </div>
                  )}
                </div>
              )
            })}
            {arcs.length === 0 && <div className="small muted" style={{ padding: 8 }}>No connections from here in map.json. Pick a route on the map to go on from here.</div>}
          </div>
        </div>

        <div className="fixed home">
          <div className="row"><span className="lbl">Way home</span><span className="spacer" /><button className="btn link small" onClick={() => setShowWay(showWay === 'home' ? null : 'home')}>{showWay === 'home' ? 'Hide' : 'Timeline'}</button></div>
          <div className="main">{inout.airports[wh.from]?.name ?? wh.from} to Copenhagen, leaves {dayTime(wh.depart)}</div>
          <div className="sub">Home {dayTime(wh.arrive)} · {hours(wh.total_hours)} door to door · {wh.flights} flights{wh.us_transit ? ' · US transit' : ''}</div>
          <HubChips way={wh} />
          {showWay === 'home' && <div style={{ marginTop: 10 }}><WayTimeline data={inout} way={wh} /></div>}
        </div>
      </div>

      <div className="rightcol">
        <div className="card pad" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 20 }}>
          <div>
            <h3 className="h3">Dates</h3>
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              Day 1 on the ground <b>{day(sched.firstDay)}</b><br />
              Flight home <b>{dayTime(sched.homeDepart)}</b><br />
              Planned to <b>{day(sched.endDate)}</b> ·{' '}
              <span className={'slack ' + (sched.slack >= 0 ? 'pos' : 'neg')}>
                {sched.slack >= 0 ? `${sched.slack} ${sched.slack === 1 ? 'day' : 'days'} left` : `${-sched.slack} ${sched.slack === -1 ? 'day' : 'days'} over`}
              </span>
            </div>
            {sched.warnings.length > 0 && (
              <div className="warns" style={{ marginTop: 10 }}>
                {sched.warnings.map((w, i) => <div key={i} className={'wn ' + w.level}>{w.text}</div>)}
              </div>
            )}
          </div>
          <div>
            <h3 className="h3">Totals</h3>
            <TotalsPanel t={tot} compact />
          </div>
        </div>
        <Calendar data={data} journey={journey} sched={sched} wi={wi} wh={wh} />
      </div>
    </div>
  )
}
