import { useEffect, useState } from 'react'
import { loadDash, loadMapData, type DashData } from './data/load'
import { readTrips, writeTrips, type TripState } from './data/trips'
import type { MapData } from './data/types'
import { RouteMap } from './map/RouteMap'
import { OptionsPane } from './options/OptionsPane'

const OPTIONS_KEY = 'latam-web.options'

/** The pane starts open on a wide window and closed on a phone, then remembers the last choice. */
function readOptionsOpen(): boolean {
  try {
    const v = localStorage.getItem(OPTIONS_KEY)
    if (v === '1' || v === '0') return v === '1'
  } catch { /* private window or blocked storage: fall through to the default */ }
  return typeof window !== 'undefined' && window.innerWidth >= 1024
}

export function App() {
  const [data, setData] = useState<MapData | null>(null)
  const [error, setError] = useState<string | null>(null)
  // every edit is saved straight away, so a trip being built survives a reload
  const [trips, setTrips] = useState<TripState>(readTrips)
  const [dash, setDash] = useState<DashData | null>(null)
  const [optionsOpen, setOptionsOpen] = useState(readOptionsOpen)
  // the option row picked in the pane: its id, and the airports the map rings for it
  const [picked, setPicked] = useState<{ id: string; airports: string[] } | null>(null)

  useEffect(() => {
    loadMapData().then(setData, (e: unknown) => setError(e instanceof Error ? e.message : String(e)))
    loadDash().then(setDash)
  }, [])
  useEffect(() => writeTrips(trips), [trips])
  useEffect(() => {
    try { localStorage.setItem(OPTIONS_KEY, optionsOpen ? '1' : '0') } catch { /* nothing to remember into */ }
  }, [optionsOpen])

  if (error) {
    return (
      <main className="app-msg">
        <p className="app-msg-t">Could not load the route data</p>
        <p className="mono">{error}</p>
        <p>Run <code>python src/build_web_data.py</code> from the repo root, then reload.</p>
      </main>
    )
  }
  if (!data) return <main className="app-msg mono">Loading routes…</main>
  return (
    <main className={`app${optionsOpen ? ' with-options' : ''}`}>
      <header className="bar">
        <div className="bar-brand">
          <span className="bar-name">Route Atlas</span>
          <span className="bar-sub">Latin America, Dec to Feb</span>
        </div>
        <button
          type="button"
          className={`bar-toggle${optionsOpen ? ' on' : ''}`}
          aria-pressed={optionsOpen}
          aria-controls="options-pane"
          onClick={() => setOptionsOpen((v) => !v)}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 3.5h12M2 8h12M2 12.5h12M6 3.5v9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </svg>
          Options
        </button>
      </header>
      <div className="app-body">
        <section className="app-map" aria-label="Route map">
          <RouteMap data={data} trips={trips} onTrips={setTrips} highlight={picked?.airports} />
        </section>
        {optionsOpen && (
          <aside className="app-options" id="options-pane">
            <OptionsPane
              dash={dash}
              picked={picked?.id ?? null}
              onPick={(id, airports) => setPicked(id ? { id, airports } : null)}
              onClose={() => setOptionsOpen(false)}
            />
          </aside>
        )}
      </div>
    </main>
  )
}
