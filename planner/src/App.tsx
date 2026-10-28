import { useEffect, useState } from 'react'
import { loadData } from './data/load'
import { useStore } from './store'
import { observed } from './lib/format'
import { PickScreen } from './screens/PickScreen'
import { BuildScreen } from './screens/BuildScreen'
import { TotalsScreen } from './screens/TotalsScreen'
import { MapScreen } from './screens/MapScreen'

export function App() {
  const data = useStore((s) => s.data)
  const setData = useStore((s) => s.setData)
  const screen = useStore((s) => s.screen)
  const go = useStore((s) => s.go)
  const journey = useStore((s) => s.journey)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [setData])

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

  const tabs: [typeof screen, string, boolean][] = [
    ['pick', 'Pick in and out', true],
    ['map', 'Map', true],
    ['build', 'Journey builder', !!journey],
    ['totals', 'Totals and compare', true],
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
          {tabs.map(([id, label, enabled], i) => (
            <button key={id} className={'tab' + (screen === id ? ' on' : '')} disabled={!enabled} onClick={() => go(id)} aria-current={screen === id ? 'page' : undefined}>
              <span className="n">{i + 1}</span>
              {label}
            </button>
          ))}
        </nav>
      </header>
      {screen === 'pick' && <PickScreen data={data} />}
      {screen === 'map' && <MapScreen />}
      {screen === 'build' && journey && <BuildScreen data={data} journey={journey} />}
      {screen === 'totals' && <TotalsScreen data={data} />}
    </div>
  )
}
