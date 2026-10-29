import { useEffect, useState } from 'react'
import type { Family } from '@map/data/types'
import type { Model } from '@map/data/model'
import { TRIP_COLORS } from '@map/data/trips'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { hours, kr, weekdayDay } from '../lib/format'
import { nodeForAirport, nodeName, schedule, totals, type Journey } from '../lib/journey'
import { countryName } from '../lib/colors'
import { Flag } from '@map/map/Flag'
import { arcsSorted, shortestPath, type PathMetric } from '../lib/graph'
import { hopFromArc } from '../lib/journey'
import { hoverProps } from './PlaceCard'
import { ReachList } from './ReachList'
import { Calendar, Close, Download, External, Grip, Land, ModeChip, Moon, Plane } from './icons'
import { hopLink } from '../lib/links'

// The open trip, on the right of the map: its two fixed flights and the stops between them.
// A stop is the cursor: the map lights what it reaches, and a tap on a lit city adds the next
// stop right after it. A tap on that stop again stops building and leaves the itinerary. Stops can be dragged into another order or removed. A tap on the map
// beside the pane folds it to a small card in the corner, a tap on the card unfolds it.

const family = (mode: string): Family => (mode === 'flight' ? 'flight' : mode === 'boat' ? 'boat' : 'ground')

function Money({ v }: { v: number | null }) {
  return v == null ? <span className="q" title="Unknown for at least one part">not known</span> : <>{kr(v)}</>
}

/** The route map's model and the modes switched on on it, for the list of places one leg away. */
export interface Reach {
  model: Model
  families: Set<Family>
}

export function TripPanel({ data, journey, mini, onExpand, reach = null }: { data: AppData; journey: Journey; mini: boolean; onExpand: () => void; reach?: Reach | null }) {
  const { inout, map } = data
  const saved = useStore((s) => s.saved)
  const setJourney = useStore((s) => s.setJourney)
  const saveJourney = useStore((s) => s.saveJourney)
  const closeTrip = useStore((s) => s.closeTrip)
  const openTrip = useStore((s) => s.openTrip)
  const go = useStore((s) => s.go)
  const cursor = useStore((s) => s.cursor)
  const setCursor = useStore((s) => s.setCursor)
  const toggleCursor = useStore((s) => s.toggleCursor)
  const idle = useStore((s) => s.idle)
  const removeStop = useStore((s) => s.removeStop)
  const moveStop = useStore((s) => s.moveStop)
  const insertLeg = useStore((s) => s.insertLeg)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(journey.name)
  useEffect(() => setName(journey.name), [journey.name])
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  const wi = inout.ways[journey.wayIn]
  const wh = inout.ways[journey.wayHome]
  const nm = (id: string) => nodeName(map, inout, id)
  const node = (id: string) => map.nodes.find((n) => n.id === id)
  const stored = saved.find((s) => s.id === journey.id)
  const dirty = !stored || JSON.stringify({ ...stored, savedAt: 0 }) !== JSON.stringify({ ...journey, savedAt: 0 })

  if (!wi || !wh) {
    return (
      <aside className="panel plan">
        <div className="plan-h">
          <h2>{journey.name}</h2>
          <button className="x" onClick={closeTrip} aria-label="Close trip"><Close /></button>
        </div>
        <p className="plan-empty">Its flights are no longer in the data. Pick a new way in and home.</p>
        <div className="plan-acts"><button className="pbtn primary" onClick={() => go('trips', 'pick')}>Pick in and out</button></div>
      </aside>
    )
  }

  const exitNode = nodeForAirport(inout, wh.from)
  const sched = schedule(journey, wi, wh, exitNode, nm)
  const t = totals(data, journey, sched)
  const allIn = t.tickets_dkk + t.regional_flights_dkk + t.ground_dkk + (t.hub_stay_dkk ?? 0) + (t.cabin_bag_dkk ?? 0)
  const lastIdx = journey.places.length - 1
  const at = cursor ?? lastIdx
  const here = journey.places[at]
  const atEnd = at === lastIdx
  const endsAtExit = journey.places[lastIdx].node === exitNode

  const update = (places: Journey['places']) => setJourney({ ...journey, places })
  const finish = (metric: PathMetric) => {
    const r = shortestPath(map, here.node, exitNode, metric)
    if (!r || !r.arcs.length) return
    let from = here.node
    const added = r.arcs.map((arc) => {
      const place = { node: arc.to, hop: hopFromArc(from, arc, null) }
      from = arc.to
      return place
    })
    update([...journey.places, ...added])
    setCursor(null)
  }
  const canFinish = atEnd && !endsAtExit && arcsSorted(map, here.node).length > 0
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(journey, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${journey.name.replace(/[^\w-]+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const commitName = () => {
    setEditing(false)
    const n = name.trim()
    if (n && n !== journey.name) setJourney({ ...journey, name: n })
    else setName(journey.name)
  }
  const drop = (i: number) => {
    if (drag != null && i > 0 && i !== drag) moveStop(drag, i)
    setDrag(null)
    setOver(null)
  }

  if (mini) {
    return (
      <button type="button" className="panel plan mini" onClick={onExpand} aria-expanded={false} aria-label={`Open trip ${journey.name}, folded. Unfold`} title="Unfold the trip">
        <span className="mini-h">
          <b>{journey.name}</b>
          {dirty && <span className="mini-dot" title="Not saved" />}
          <Grip />
        </span>
        <span className="mini-facts">
          <span><b>{kr(allIn)}</b><small>all in</small></span>
          <span><b>{journey.places.length}</b><small>{journey.places.length === 1 ? 'stop' : 'stops'}</small></span>
          <span><b>{sched.totalDays}</b><small>days</small></span>
        </span>
        {!idle && <span className="mini-next"><span className="plan-pulse" />Next from {nm(here.node)}</span>}
      </button>
    )
  }

  const next = (
    <li className="plan-next" key="next">
      <span className="plan-pulse" />
      <div>
        <b>Next from {nm(here.node)}</b>
        <small>{atEnd && endsAtExit ? 'Tap a lit city or pick one below to go on. The route comes back here to fly home.' : 'Tap a lit city on the map or pick one below.'}</small>
        {canFinish && (
          <span className="plan-finish">
            <span>To {nm(exitNode)}</span>
            <button onClick={() => finish('hours')}>fastest</button>
            <button onClick={() => finish('price')}>cheapest</button>
          </span>
        )}
        {reach && <ReachList key={here.node} model={reach.model} families={reach.families} here={here.node} onPick={insertLeg} />}
      </div>
    </li>
  )

  return (
    <aside className="panel plan" aria-label="Open trip">
      <div className="plan-h">
        {editing ? (
          <input
            className="plan-name"
            value={name}
            autoFocus
            onChange={(e) => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') { setName(journey.name); setEditing(false) } }}
            aria-label="Trip name"
          />
        ) : (
          <button className="plan-title" onClick={() => setEditing(true)} title="Rename">
            <h2>{journey.name}</h2>
          </button>
        )}
        <button className="x sm" onClick={() => openTrip(journey)} aria-label="Open the trip dashboard" title="Dashboard"><Calendar /></button>
        <button className="x" onClick={closeTrip} aria-label="Close trip"><Close /></button>
      </div>
      <div className="plan-sum">
        <span className="plan-total"><b>{kr(allIn)}</b><small>all in</small></span>
        <span><b>{journey.places.length}</b><small>{journey.places.length === 1 ? 'stop' : 'stops'}</small></span>
        <span><b>{sched.totalDays}</b><small>days</small></span>
      </div>

      <div className="plan-body">
        <ol className="plan-list">
          <li className="plan-way in" title={`Lands ${nm(nodeForAirport(inout, wi.to))}, ${hours(wi.total_hours)} from Copenhagen`}>
            <span className="io-ic in"><Land /></span>
            <b>{weekdayDay(wi.arrive)}</b>
            <small>{wi.arrive.slice(11, 16)}</small>
            <button className="plan-link" onClick={() => go('trips', 'pick')}>Change</button>
          </li>
          {journey.places.flatMap((p, i) => {
            const n = node(p.node)
            const h = p.hop
            const cur = !idle && i === at
            const c = n?.country ?? inout.airports[p.node]?.country ?? ''
            const row = (
              <li
                key={i}
                className={`plan-place${over === i && drag !== i ? ' over' : ''}${drag === i ? ' lifted' : ''}`}
                onDragOver={(e) => { if (drag != null && i > 0) { e.preventDefault(); setOver(i) } }}
                onDragLeave={() => over === i && setOver(null)}
                onDrop={(e) => { e.preventDefault(); drop(i) }}
              >
                {h && (
                  <div
                    className={`plan-hop ${family(h.mode)}`}
                    title={[h.overland, h.operator, h.flight?.via.length ? `via ${h.flight.via.join(', ')}` : null, h.overnight ? 'overnight' : null].filter(Boolean).join(' · ') || undefined}
                  >
                    <ModeChip family={family(h.mode)} />
                    <span className="plan-hopt">
                      {h.hours != null && <span>{hours(h.hours)}</span>}
                      {h.price_dkk != null && <span>{kr(h.price_dkk)}</span>}
                    </span>
                    {h.overnight && <Moon />}
                    {(() => {
                      const l = hopLink(h, inout)
                      return l && (
                        <a className="plan-hop-link" href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.saved ? `Open this flight on ${l.site}` : `Search this flight on ${l.site}`} title={l.saved ? `Open on ${l.site}` : `Search ${l.site}`}>
                          <External />
                        </a>
                      )
                    })()}
                  </div>
                )}
                <div
                  className={`plan-stop${cur ? ' cur' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={cur}
                  aria-label={cur ? `Stop building from ${nm(p.node)}` : `Build from ${nm(p.node)}`}
                  title={cur ? 'Tap again to see the whole trip' : undefined}
                  onClick={() => toggleCursor(i)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCursor(i) } }}
                >
                  {i > 0 ? (
                    <span
                      className="plan-grip"
                      draggable
                      title="Drag to move this stop"
                      onClick={(e) => e.stopPropagation()}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(i)); setDrag(i) }}
                      onDragEnd={() => { setDrag(null); setOver(null) }}
                    >
                      <Grip />
                    </span>
                  ) : (
                    <span className="plan-grip fixed" title="The trip starts where the flight lands" />
                  )}
                  <span className="plan-n" style={{ background: cur ? '#C98A12' : TRIP_COLORS[0] }}>{i + 1}</span>
                  <Flag code={c} size={12} title={countryName(c)} />
                  <b className="plan-who" {...hoverProps(n)}>{nm(p.node)}</b>
                  {sched.places[i]?.arrive && <span className="plan-when" title="A dated flight brings you here">{weekdayDay(sched.places[i].arrive!)}</span>}
                  {i > 0 && (
                    <button className="plan-rm" onClick={(e) => { e.stopPropagation(); removeStop(i) }} aria-label={`Remove ${nm(p.node)}`} title="Remove this stop"><Close /></button>
                  )}
                </div>
              </li>
            )
            return cur ? [row, next] : [row]
          })}
          <li className="plan-way home" title={`Flies home from ${nm(exitNode)}, ${hours(wh.total_hours)} to Copenhagen`}>
            <span className="io-ic home"><Plane s={13} /></span>
            <b>{weekdayDay(wh.depart)}</b>
            <small>{wh.depart.slice(11, 16)}</small>
            {!endsAtExit && <span className="plan-exit"><Flag code={node(exitNode)?.country ?? inout.airports[exitNode]?.country ?? ''} size={11} />{nm(exitNode)}</span>}
          </li>
        </ol>

        <details className="plan-costs">
          <summary>Costs</summary>
          <dl className="plan-tot">
            <dt>Long-haul tickets</dt><dd>{kr(t.tickets_dkk)}</dd>
            <dt>Regional flights</dt><dd>{kr(t.regional_flights_dkk)}</dd>
            <dt>Ground transport</dt><dd>{kr(t.ground_dkk)}{t.ground_unknown ? <span className="q" title={`${t.ground_unknown} hop(s) without a price`}>, some not priced</span> : null}</dd>
            <dt>Cabin bags</dt><dd><Money v={t.cabin_bag_dkk} /></dd>
            <dt>Hub nights, stay est.</dt><dd>{t.hub_nights} · <Money v={t.hub_stay_dkk} /></dd>
            <dt>Flights, hours in the air</dt><dd>{t.flights} · {hours(t.air_hours)}</dd>
          </dl>
        </details>
      </div>

      <div className="plan-acts">
        <button className={`pbtn ${dirty ? 'primary' : 'ghost done'}`} onClick={() => saveJourney(journey.name)} disabled={!dirty}>{dirty ? 'Save trip' : 'Saved'}</button>
        <button className="x sm" onClick={exportJson} aria-label="Export this trip as JSON" title="Export JSON"><Download /></button>
      </div>
    </aside>
  )
}

/** What sits beside the map: the open trip. With none open the map is left to look around in. */
export function MapSide({ reach = null }: { reach?: Reach | null }) {
  const data = useStore((s) => s.data)
  const journey = useStore((s) => s.journey)
  const mapOpen = useStore((s) => s.mapOpen)
  const paneMini = useStore((s) => s.paneMini)
  const setPaneMini = useStore((s) => s.setPaneMini)
  if (!data || !journey || !mapOpen) return null
  return <TripPanel data={data} journey={journey} mini={paneMini} onExpand={() => setPaneMini(false)} reach={reach} />
}
