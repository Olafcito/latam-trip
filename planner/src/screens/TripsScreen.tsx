import { useRef, useState } from 'react'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { day, dayDiff, hours, kr } from '../lib/format'
import { nodeForAirport, nodeName, schedule, totals, type Journey } from '../lib/journey'
import { countryColor, countryName } from '../lib/colors'
import { PickScreen } from './PickScreen'
import { Download, Pin, Plus, Trash } from '../components/icons'

// The Trips tab: start a new trip, or open a saved one on the map. Comparing, export and import stay below.

function summarize(data: AppData, j: Journey) {
  const wi = data.inout.ways[j.wayIn]
  const wh = data.inout.ways[j.wayHome]
  if (!wi || !wh) return null
  const nm = (id: string) => nodeName(data.map, data.inout, id)
  const sched = schedule(j, wi, wh, nodeForAirport(data.inout, wh.from), nm)
  const t = totals(data, j, sched)
  const countries = Object.entries(t.days_per_country).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
  const days = Math.max(1, dayDiff(wi.arrive, wh.depart))
  return { wi, wh, sched, t, countries, days, route: j.places.map((p) => nm(p.node)), total: t.tickets_dkk + t.regional_flights_dkk + t.ground_dkk + (t.hub_stay_dkk ?? 0) }
}

export function TripsScreen({ data }: { data: AppData }) {
  const view = useStore((s) => s.view)
  if (view === 'pick') return <PickScreen data={data} />
  return <Landing data={data} />
}

function Landing({ data }: { data: AppData }) {
  const journey = useStore((s) => s.journey)
  const saved = useStore((s) => s.saved)
  const compare = useStore((s) => s.compare)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const deleteSaved = useStore((s) => s.deleteSaved)
  const importJourneys = useStore((s) => s.importJourneys)
  const openSaved = useStore((s) => s.openSaved)
  const go = useStore((s) => s.go)
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)

  const unsaved = journey && !saved.some((s) => s.id === journey.id) ? journey : null
  const list = [...(unsaved ? [unsaved] : []), ...saved].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  const cmp = compare.map((id) => saved.find((s) => s.id === id)).filter((j): j is Journey => !!j).map((j) => ({ j, s: summarize(data, j) }))

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'latam-journeys.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const onImport = async (f: File | undefined) => {
    if (!f) return
    try {
      const n = importJourneys(JSON.parse(await f.text()))
      setMsg(`${n} ${n === 1 ? 'trip' : 'trips'} imported`)
    } catch {
      setMsg('That file is not a trip export')
    }
  }

  return (
    <div className="landing">
      <div className="tripgrid">
        <button className="card newtrip" onClick={() => go('trips', 'pick')}>
          <span className="plus"><Plus /></span>
          <span className="t">New trip</span>
          <span className="s">Start with the flights in and home, then build the route on the map.</span>
        </button>
        {list.map((j) => {
          const s = summarize(data, j)
          const isCur = journey?.id === j.id
          const asking = confirm === j.id
          return (
            <article key={j.id} className={`card tripcard${isCur ? ' cur' : ''}`}>
              <header>
                <h3>{j.name}</h3>
                {j.rank != null && <span className="rank" title="Rank among the seeded trips">#{j.rank}</span>}
                {j === unsaved && <span className="pill draft">Not saved</span>}
              </header>
              {s ? (
                <>
                  <p className="route">{s.route.join(' · ')}</p>
                  <div className="facts">
                    <span><b>{kr(s.total)}</b><small>all in</small></span>
                    <span><b>{s.days}</b><small>days</small></span>
                    <span><b>{day(s.wi.arrive)}</b><small>lands</small></span>
                    <span><b>{day(s.wh.depart)}</b><small>flies home</small></span>
                  </div>
                  <div className="bar" aria-label="Days per country">
                    {s.countries.map(([c, n]) => (
                      <i key={c} style={{ flexGrow: n, background: countryColor(c) }} title={`${countryName(c)}: ${n} ${n === 1 ? 'day' : 'days'}`} />
                    ))}
                  </div>
                  <p className="small muted dim">
                    {kr(s.t.tickets_dkk)} long haul · {hours(s.t.air_hours)} in the air
                    {s.sched.warnings.length > 0 && <span className="warnchip">{s.sched.warnings.length} {s.sched.warnings.length === 1 ? 'warning' : 'warnings'}</span>}
                  </p>
                </>
              ) : (
                <p className="small muted">Its flights are no longer in the data.</p>
              )}
              <footer>
                <button className="btn primary small" onClick={() => openSaved(j)} disabled={!s}><Pin />Open on the map</button>
                {j !== unsaved && (
                  <label className="chk small"><input type="checkbox" checked={compare.includes(j.id)} onChange={() => toggleCompare(j.id)} /> Compare</label>
                )}
                <span className="spacer" />
                {j !== unsaved && (asking ? (
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn small danger" onClick={() => { deleteSaved(j.id); setConfirm(null) }}>Delete</button>
                    <button className="btn link small" onClick={() => setConfirm(null)}>Keep</button>
                  </span>
                ) : (
                  <button className="btn link small" onClick={() => setConfirm(j.id)} aria-label={`Delete ${j.name}`}><Trash /></button>
                ))}
              </footer>
            </article>
          )
        })}
      </div>

      {cmp.length > 0 && (
        <div className="card pad">
          <h2 className="h2" style={{ marginBottom: 8 }}>Compare, {cmp.length} of 3</h2>
          <div className="tablewrap">
            <table className="cmp">
              <thead>
                <tr><th />{cmp.map(({ j }) => <th key={j.id}>{j.name}</th>)}</tr>
              </thead>
              <tbody>
                {([
                  ['Route', (s) => s.route.join(' → ')],
                  ['Lands', (s) => `${data.inout.airports[s.wi.to]?.name ?? s.wi.to}, ${day(s.wi.arrive)}`],
                  ['Flies home', (s) => `${data.inout.airports[s.wh.from]?.name ?? s.wh.from}, ${day(s.wh.depart)}`],
                  ['Days', (s) => String(s.days)],
                  ['Long-haul tickets', (s) => kr(s.t.tickets_dkk)],
                  ['Regional flights', (s) => kr(s.t.regional_flights_dkk)],
                  ['Cabin-bag fees', (s) => kr(s.t.cabin_bag_dkk)],
                  ['Checked-bag fees', (s) => kr(s.t.checked_bag_dkk)],
                  ['Hub nights', (s) => String(s.t.hub_nights)],
                  ['Hub stay est.', (s) => kr(s.t.hub_stay_dkk)],
                  ['Ground transport', (s) => kr(s.t.ground_dkk)],
                  ['All in', (s) => kr(s.total)],
                  ['Flights', (s) => String(s.t.flights)],
                  ['Hours in the air', (s) => hours(s.t.air_hours)],
                  ['Slack', (s) => (s.sched.slack >= 0 ? `${s.sched.slack} days left` : `${-s.sched.slack} days over`)],
                  ['Days per country', (s) => s.countries.map(([c, n]) => `${countryName(c)} ${n}`).join(', ')],
                ] as [string, (s: NonNullable<ReturnType<typeof summarize>>) => string][]).map(([label, f]) => (
                  <tr key={label}>
                    <th>{label}</th>
                    {cmp.map(({ j, s }) => <td key={j.id}>{s ? f(s) : '?'}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="row small muted iolinks">
        <button className="btn link small" onClick={exportAll} disabled={!saved.length}><Download />Export all trips</button>
        <button className="btn link small" onClick={() => file.current?.click()}>Import trips</button>
        <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = '' }} />
        {msg && <span>{msg}</span>}
      </div>
    </div>
  )
}
