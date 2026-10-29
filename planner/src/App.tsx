import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { loadData } from './data/load'
import { loadRepoTrips } from './data/routeMap'
import { resolveDeepLink, rowToJourney, urlWithTrip, withTripWays } from './lib/repoTrips'
import { useStore, type Screen } from './store'
import { observed } from './lib/format'
import { Warn } from './components/icons'
import { Freshness } from './components/Freshness'
import { MapScreen } from './screens/MapScreen'
import { TripsScreen } from './screens/TripsScreen'

const TABS: [Screen, string][] = [
  ['map', 'Map'],
  ['trips', 'Trips'],
]

/** The indicator is 100px wide and scaled to the tab, so it only ever moves by transform. */
const IND_W = 100

// Mark whether the last input was a key or a pointer, so a keyboard action changes state at once
// instead of sliding (the CSS reads data-input on the root).
function useInputMode() {
  useEffect(() => {
    const root = document.documentElement
    const key = () => { root.dataset.input = 'key' }
    const pointer = () => { root.dataset.input = 'pointer' }
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', pointer, true)
    return () => {
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', pointer, true)
    }
  }, [])
}

function Tabs({ screen, go }: { screen: Screen; go: (s: Screen) => void }) {
  const nav = useRef<HTMLElement>(null)
  const ind = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)

  useLayoutEffect(() => {
    // slide when the screen changes, jump when the layout does (first paint, fonts, resize)
    const place = (slide: boolean) => {
      const tab = nav.current?.querySelector<HTMLElement>('[aria-current="page"]')
      const bar = ind.current
      if (!tab || !bar) return
      const jump = !slide || !placed.current
      if (jump) bar.style.transition = 'none'
      bar.style.transform = `translateX(${tab.offsetLeft}px) scaleX(${tab.offsetWidth / IND_W})`
      bar.style.opacity = '1'
      if (jump) {
        void bar.offsetWidth
        bar.style.transition = ''
      }
      placed.current = true
    }
    place(true)
    const ro = new ResizeObserver(() => place(false))
    if (nav.current) ro.observe(nav.current)
    void document.fonts?.ready.then(() => place(false))
    return () => ro.disconnect()
  }, [screen])

  return (
    <nav className="tabs" aria-label="Screens" ref={nav}>
      {TABS.map(([id, label]) => (
        <button key={id} className={'tab' + (screen === id ? ' on' : '')} onClick={() => go(id)} aria-current={screen === id ? 'page' : undefined}>
          {label}
        </button>
      ))}
      <span className="tabs-ind" ref={ind} aria-hidden="true" />
    </nav>
  )
}

// The deep link is read once, when the data and the table trips are in. Until then the address is left alone.
let linkRead = false

/** /?trip=<id> opens that trip, as a click in the Trips list does. An unknown id shows the list with a note. */
function openDeepLink() {
  linkRead = true
  const s = useStore.getState()
  const link = resolveDeepLink(window.location.search, s.saved, s.journey)
  if (!link) return syncAddress()
  if (link.kind === 'open') return s.openTrip(link.journey)
  s.go('trips', 'home')
  s.setNotice(`There is no trip with the id ${link.id}. These are the trips there are.`)
}

/** ?trip=<id> while a trip is open, nothing when none is. */
function syncAddress() {
  if (!linkRead) return
  const s = useStore.getState()
  const id = s.view === 'trip' && s.journey ? s.journey.id : null
  const next = urlWithTrip(window.location.href, id)
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(window.history.state, '', next)
  }
}

export function App() {
  const data = useStore((s) => s.data)
  const setData = useStore((s) => s.setData)
  const screen = useStore((s) => s.screen)
  const go = useStore((s) => s.go)
  const [error, setError] = useState<string | null>(null)

  const setRepoTrips = useStore((s) => s.setRepoTrips)
  useInputMode()

  useEffect(() => {
    // the table trips bring their own ways in and home, so they load with the data
    Promise.all([loadData(), loadRepoTrips()]).then(
      ([d, rows]) => {
        setData({ ...d, inout: withTripWays(d.inout, rows) })
        setRepoTrips(rows.map(rowToJourney))
        openDeepLink()
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [setData, setRepoTrips])

  useEffect(() => useStore.subscribe(syncAddress), [])

  if (error) {
    return (
      <div className="app">
        <main className="main">
          <div className="card load-err" role="alert">
            <p className="load-err-t"><Warn s={16} /> Could not load the trip data</p>
            <p className="mono small">{error}</p>
            <p className="small muted">Check the connection, or run <code>npm run sync-data</code> for an offline copy.</p>
          </div>
        </main>
      </div>
    )
  }
  if (!data) {
    return (
      <div className="app">
        <main className="main"><p className="loading" aria-live="polite">Loading flights and routes…</p></main>
      </div>
    )
  }

  const fact = `Data from ${data.source === 'github' ? 'GitHub' : 'the offline copy'}, built ${observed(data.inout.generated_at)}`
  return (
    <div className={'app' + (screen === 'map' ? ' wide' : '')}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <div className="top-in">
          <div className="brand" title={fact}>
            <h1 className="brand-mark" translate="no">LatAm</h1>
            <span className="brand-dates">Dec 2026 to Feb 2027</span>
            <span className="brand-src">{fact}</span>
          </div>
          <Tabs screen={screen} go={go} />
          <div className="fresh-slot"><Freshness meta={data.meta} /></div>
        </div>
      </header>
      <main className="main" id="main" tabIndex={-1}>
        {screen === 'map' && <MapScreen />}
        {screen === 'trips' && <TripsScreen data={data} />}
      </main>
    </div>
  )
}
