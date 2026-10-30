import type { AppData } from '../data/types'
import { useStore } from '../store'
import { nodeForAirport, nodeName, schedule, totals, type Journey } from '../lib/journey'
import { TotalsPanel } from '../components/TotalsPanel'
import { MiniMap } from '../components/MiniMap'
import { Download, Pin, Warn } from '../components/icons'
import { Story } from '../components/story/Story'
import { TripHead } from '../components/story/TripHead'

// The dashboard of one trip: the route as a story down a rail, from Copenhagen and back, with the
// costs and the map beside it. Details rest behind a hover or a click.


export function TripDashboard({ data, journey }: { data: AppData; journey: Journey }) {
  const { inout, map } = data
  const saved = useStore((s) => s.saved)
  const openSaved = useStore((s) => s.openSaved)
  const saveJourney = useStore((s) => s.saveJourney)
  const go = useStore((s) => s.go)

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
  // a warning about one leg sits on that leg
  const general = sched.warnings.filter((w) => w.leg == null && w.picked == null)
  const heads = journey.places.map((p, i) => ({ name: nm(p.node), node: map.nodes.find((n) => n.id === p.node), days: sched.places[i].days, inDay: sched.places[i].inDay }))

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

      {general.length > 0 && (
        <ul className="dash-warn">
          {general.map((w, i) => (
            <li key={i} className={w.level}>
              <Warn />{w.text}
            </li>
          ))}
        </ul>
      )}

      <div className="dash-grid">
        <section className="card pad dash-route" aria-label="Route">
          <TripHead places={heads} />
          <Story data={data} journey={journey} sched={sched} wayIn={wi} wayHome={wh} />
        </section>

        <div className="dash-side">
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
