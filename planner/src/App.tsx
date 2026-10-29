import { useEffect, useState } from 'react'
import { loadData } from './data/load'
import { loadSeeds } from './data/routeMap'
import { withSeedWays } from './lib/seeds'
import { useStore } from './store'
import { observed } from './lib/format'
import { MapScreen } from './screens/MapScreen'
import { TripsScreen } from './screens/TripsScreen'

export function App() {
  const data = useStore((s) => s.data)
  const setData = useStore((s) => s.setData)
  const screen = useStore((s) => s.screen)
  const go = useStore((s) => s.go)
  const [error, setError] = useState<string | null>(null)

  const importSeeds = useStore((s) => s.importSeeds)

  useEffect(() => {
    // the ranked trips bring their own ways in and home, so they load with the data
    Promise.all([loadData(), loadSeeds()]).then(
      ([d, seeds]) => {
        setData({ ...d, inout: withSeedWays(d.inout, seeds) })
        importSeeds(seeds)
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [setData, importSeeds])

  if (error) {
    return (
      <div className="app">
        <div className="card loading">
          <b>Could not load the trip data</b>
          <p className="small">{error}</p>
          <p className="small">Check the connection, or run <code>npm run sync-data</code> for an offline copy.</p>
        </div>
      </div>
    )
  }
  if (!data) return <div className="app"><div className="loading">Loading flights and routes…</div></div>

  const tabs: [typeof screen, string][] = [
    ['map', 'Map'],
    ['trips', 'Trips'],
  ]
  return (
    <div className={'app' + (screen === 'map' ? ' wide' : '')}>
      <header className="top">
        <div className="brand">
          <h1>LatAm trip planner</h1>
          <p>
            Copenhagen and back, Dec 2026 to Feb 2027 · data from {data.source === 'github' ? 'GitHub' : 'the offline copy'}, built{' '}
            {observed(data.inout.generated_at)}
          </p>
        </div>
        <nav className="tabs" aria-label="Screens">
          {tabs.map(([id, label], i) => (
            <button key={id} className={'tab' + (screen === id ? ' on' : '')} onClick={() => go(id)} aria-current={screen === id ? 'page' : undefined}>
              <span className="n">{i + 1}</span>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {screen === 'map' && <MapScreen />}
      {screen === 'trips' && <TripsScreen data={data} />}
    </div>
  )
}
