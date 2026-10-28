import { useRef, useState } from 'react'
import type { AppData } from '../data/types'
import { useStore } from '../store'
import { dayTime, hours, kr, observed } from '../lib/format'
import { nodeForAirport, nodeName, schedule, totals, type Journey } from '../lib/journey'
import { TotalsPanel } from '../components/TotalsPanel'
import { countryName } from '../lib/colors'

function summarize(data: AppData, j: Journey) {
  const wi = data.inout.ways[j.wayIn]
  const wh = data.inout.ways[j.wayHome]
  if (!wi || !wh) return null
  const nm = (id: string) => nodeName(data.map, data.inout, id)
  const sched = schedule(j, wi, wh, nodeForAirport(data.inout, wh.from), nm)
  return { wi, wh, sched, t: totals(data, j, sched), route: j.places.map((p) => nm(p.node)).join(' → ') }
}

export function TotalsScreen({ data }: { data: AppData }) {
  const journey = useStore((s) => s.journey)
  const saved = useStore((s) => s.saved)
  const compare = useStore((s) => s.compare)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const deleteSaved = useStore((s) => s.deleteSaved)
  const importJourneys = useStore((s) => s.importJourneys)
  const setJourney = useStore((s) => s.setJourney)
  const go = useStore((s) => s.go)
  const file = useRef<HTMLInputElement>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const cur = journey ? summarize(data, journey) : null
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
      setMsg(`${n} ${n === 1 ? 'journey' : 'journeys'} imported`)
    } catch {
      setMsg('That file is not a journey export')
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div className="card pad">
        <h2 className="h2" style={{ marginBottom: 4 }}>Current journey</h2>
        {cur && journey ? (
          <>
            <p className="small muted" style={{ marginTop: 0 }}>{journey.name}<br />{cur.route}</p>
            <TotalsPanel t={cur.t} />
            <p className="small muted">Flight prices are snapshots seen {observed(data.inout.generated_at)}. Hub stays, bags and ground transport are kept apart from the flight tickets.</p>
          </>
        ) : (
          <p className="muted">No journey yet. Pick a way in and out first.</p>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card pad">
          <div className="row">
            <h2 className="h2">Saved journeys</h2>
            <span className="spacer" />
            <button className="btn small" onClick={exportAll} disabled={!saved.length}>Export all</button>
            <button className="btn small" onClick={() => file.current?.click()}>Import</button>
            <input ref={file} type="file" accept="application/json" hidden onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = '' }} />
          </div>
          {msg && <p className="small muted">{msg}</p>}
          <div className="savedlist">
            {saved.map((j) => {
              const s = summarize(data, j)
              return (
                <div key={j.id} className="saved">
                  <label className="chk"><input type="checkbox" checked={compare.includes(j.id)} onChange={() => toggleCompare(j.id)} /> Compare</label>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="n">{j.name}</div>
                    <div className="small muted">{s ? `${s.route} · ${kr(s.t.tickets_dkk + s.t.regional_flights_dkk)}` : 'Ways no longer in the data'}</div>
                  </div>
                  <button className="btn small" onClick={() => { setJourney(j); go('build') }}>Open</button>
                  <button className="btn link small" onClick={() => deleteSaved(j.id)}>Delete</button>
                </div>
              )
            })}
            {!saved.length && <div className="empty">Save a journey in the builder to compare it here.</div>}
          </div>
        </div>

        {cmp.length > 0 && (
          <div className="card pad">
            <h2 className="h2" style={{ marginBottom: 8 }}>Compare ({cmp.length} of 3)</h2>
            <div className="tablewrap">
              <table className="cmp">
                <thead>
                  <tr><th />{cmp.map(({ j }) => <th key={j.id}>{j.name}</th>)}</tr>
                </thead>
                <tbody>
                  {([
                    ['Route', (s) => s.route],
                    ['Leaves CPH', (s) => dayTime(s.wi.depart)],
                    ['Lands', (s) => `${data.inout.airports[s.wi.to]?.name ?? s.wi.to}, ${dayTime(s.wi.arrive)}`],
                    ['Departs home', (s) => `${data.inout.airports[s.wh.from]?.name ?? s.wh.from}, ${dayTime(s.wh.depart)}`],
                    ['Home in CPH', (s) => dayTime(s.wh.arrive)],
                    ['Long-haul tickets', (s) => kr(s.t.tickets_dkk)],
                    ['Regional flights', (s) => kr(s.t.regional_flights_dkk)],
                    ['Cabin-bag fees', (s) => kr(s.t.cabin_bag_dkk)],
                    ['Checked-bag fees', (s) => kr(s.t.checked_bag_dkk)],
                    ['Hub nights', (s) => String(s.t.hub_nights)],
                    ['Hub stay est.', (s) => kr(s.t.hub_stay_dkk)],
                    ['Ground transport', (s) => kr(s.t.ground_dkk)],
                    ['Flights', (s) => String(s.t.flights)],
                    ['Hours in the air', (s) => hours(s.t.air_hours)],
                    ['Slack', (s) => (s.sched.slack >= 0 ? `${s.sched.slack} days left` : `${-s.sched.slack} days over`)],
                    ['Days per country', (s) => Object.entries(s.t.days_per_country).filter(([, n]) => n).map(([c, n]) => `${countryName(c)} ${n}`).join(', ')],
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
      </div>
    </div>
  )
}
