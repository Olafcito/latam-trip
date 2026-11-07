import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { dataBase } from '@map/data/remoteFiles'
import { loadData } from './data/load'
import { loadRepoTrips } from './data/routeMap'
import { pickedLeg, readPick, withoutPick, type Pick } from './lib/pickLink'
import { resolveDeepLink, rowToJourney, withTripWays } from './lib/repoTrips'
import { urlWithVersion, versionParam } from './lib/versions'
import { loadShared, ownShare, shareParam, urlWithShare } from './lib/shareTrip'
import { CURRENT_KEY, useStore, type Screen } from './store'
import { clock, weekdayDay } from './lib/format'
import { nodeName } from './lib/journey'
import { Warn } from './components/icons'
import { DataStrip } from './components/DataStrip'
import { Freshness } from './components/Freshness'
import { QuoteSheet } from './components/QuoteSheet'
import { ProfileButton } from './components/ProfileSheet'
import { SignIn } from './components/SignIn'
import { Consent } from './components/Consent'
import { Guide, guideRequested } from './components/Guide'
import { consentId, withoutConsent } from './lib/consent'
import { remoteEnabled, useSession } from './lib/supabase'
import { dataChanged } from './data/rev'
import { clearRouteData } from './data/routeMap'
import { clearPairDates } from './data/pairDates'
import { loadDeletedIds, loadTrips, loadVersions, subscribeTrips } from './lib/remoteTrips'
import { loadBookings, subscribeBookings } from './lib/bookings'
import { loadLodgings, subscribeLodgings } from './lib/lodgings'
import { loadDeriveState, refresh, subscribeBuilds, type DeriveState } from './lib/remoteFiles'
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
export function openDeepLink() {
  if (linkRead) return
  linkRead = true
  const s = useStore.getState()
  const pick = readPick(window.location.search)
  const linkedVersion = versionParam(window.location.search)
  if (pick) window.history.replaceState(window.history.state, '', withoutPick(window.location.href))
  const share = shareParam(window.location.search)
  if (share) return void openShareLink(share)
  const link = resolveDeepLink(window.location.search, s.saved, s.journey)
  if (link?.kind === 'unknown') {
    s.go('trips', 'home')
    return s.setNotice(`There is no trip with the id ${link.id}. These are the trips there are.`)
  }
  if (link) s.openTrip(link.journey)
  if (link) void openLinkedVersion(link.journey.id, linkedVersion)
  if (pick) return landPick(pick)
  if (!link) syncAddress()
}

// ?share=<token> while the shared trip is being read, so the address keeps it
let pendingShare: string | null = null

/** /?share=<token> opens a trip someone shared, read only (FEAT-007). The owner's own link opens their own trip. A
 *  link that is dead shows the Trips list with a note. */
async function openShareLink(token: string) {
  pendingShare = token
  try {
    // a guest has no links of their own to match
    const own = useStore.getState().guest ? null : await ownShare(token)
    const mine = own ? useStore.getState().saved.find((t) => t.id === own) : undefined
    if (mine) return useStore.getState().openTrip(mine)
    const row = await loadShared(token)
    const s = useStore.getState()
    if (row && row !== 'failed') return s.openShared(token, row)
    s.go('trips', 'home')
    s.setNotice(row === 'failed' ? 'The shared trip could not be read.' : 'That shared trip is no longer shared.')
  } finally {
    pendingShare = null
    syncAddress()
  }
}

// &v=<n> while that version is being read, so the address keeps it
let pendingVersion: number | null = null

/** /?trip=<id>&v=<n> opens version n of the trip. A version the trip does not have leaves the latest open, with a note. */
async function openLinkedVersion(id: string, version: number | null) {
  if (version == null || !remoteEnabled()) return
  const s = useStore.getState()
  const latest = s.rows[id]?.version
  if (latest == null || version === latest) return
  pendingVersion = version
  try {
    const row = (await loadVersions(id)).find((r) => r.version === version)
    const now = useStore.getState()
    if (now.journey?.id !== id) return
    if (row) now.openVersion(row, Math.max(latest, now.rows[id]?.version ?? latest))
    else now.setNotice(`This trip has no version ${version}, so the latest is open.`)
  } catch {
    useStore.getState().setNotice(`Version ${version} could not be read, so the latest is open.`)
  } finally {
    pendingVersion = null
    syncAddress()
  }
}

/** &pick=<flight> puts the flight chosen on Momondo on its leg of the open trip. */
function landPick(pick: Pick | 'bad') {
  const s = useStore.getState()
  const { journey, data } = s
  if (!journey || !data) {
    s.go('trips', 'home')
    return s.setNotice('Open the trip, then pick the flight again.')
  }
  s.openTrip(journey)
  if (pick === 'bad') return s.setNotice('The flight in that link could not be read, so nothing changed.')
  const name = (id: string) => nodeName(data.map, data.inout, id)
  const leg = pickedLeg(journey, data.map, pick)
  if (leg < 0) return s.setNotice(`This trip has no leg from ${pick.from} to ${pick.to}, so nothing changed.`)
  s.setHopFlight(leg, pick.flight)
  const hop = journey.places[leg].hop
  const { depart, carriers } = pick.flight
  if (hop) s.setNotice(`Picked ${carriers.join(', ')} from ${name(hop.from)} to ${name(hop.to)}, ${weekdayDay(depart)} at ${clock(depart)}.`)
}

/** ?trip=<id> while a trip is open, ?share=<token> while a shared trip is, nothing when none is. */
export function syncAddress() {
  if (!linkRead) return
  const s = useStore.getState()
  const token = pendingShare ?? (s.shared && s.view === 'trip' && s.journey?.id === s.shared.id ? s.shared.token : null)
  if (token) return replaceAddress(urlWithShare(window.location.href, token))
  const id = s.view === 'trip' && s.journey ? s.journey.id : null
  const v = s.viewing && s.viewing.id === id ? s.viewing.version : pendingVersion
  const href = new URL(urlWithShare(window.location.href, null), window.location.href).href
  replaceAddress(urlWithVersion(href, id, v))
}

function replaceAddress(next: string) {
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(window.history.state, '', next)
  }
}

/** The guide is public, so it renders before anything asks for a session. */
export function App() {
  return guideRequested(window.location.search) ? <Guide /> : <Planner />
}

function Planner() {
  const data = useStore((s) => s.data)
  const setData = useStore((s) => s.setData)
  const screen = useStore((s) => s.screen)
  const go = useStore((s) => s.go)
  const [error, setError] = useState<string | null>(null)
  const auth = useSession()
  // Supabase's consent step for an assistant that connects, answered here once signed in
  const [consent, setConsent] = useState(() => consentId(window.location.search))
  const closeConsent = () => {
    window.history.replaceState(window.history.state, '', withoutConsent(window.location.href))
    setConsent(null)
  }

  const setRepoTrips = useStore((s) => s.setRepoTrips)
  useInputMode()

  const userId = auth.session?.user.id ?? null
  // a shared link opened with no session is looked at as a guest, with no sign in (0040)
  const guest = useStore((s) => s.guest)
  const setGuest = useStore((s) => s.setGuest)
  useEffect(() => {
    if (!remoteEnabled() || !auth.ready) return
    if (auth.session) {
      if (guest) setGuest(null)
    } else if (!guest && shareParam(window.location.search)) setGuest('looking')
  }, [auth.ready, auth.session, guest, setGuest])
  const applyRemote = useStore((s) => s.applyRemote)
  const flushOutbox = useStore((s) => s.flushOutbox)
  const runImport = useStore((s) => s.runImport)

  useEffect(() => {
    // with Supabase the trips need the signed in session, and wait for it. A guest reads the public data and the shared trip alone
    if (remoteEnabled() && !userId) {
      if (guest !== 'looking') return
      loadData().then(
        (d) => {
          setData(d)
          openDeepLink()
        },
        (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
      )
      return
    }
    // the table trips bring their own ways in and home, so they load with the data
    const rowsFrom = remoteEnabled() ? loadTrips() : loadRepoTrips()
    const deletedFrom = remoteEnabled() ? loadDeletedIds().catch(() => []) : Promise.resolve([])
    Promise.all([loadData(), rowsFrom, deletedFrom]).then(
      ([d, rows, deleted]) => {
        setData({ ...d, inout: withTripWays(d.inout, rows) })
        if (remoteEnabled()) applyRemote(rows, deleted)
        else setRepoTrips(rows.map(rowToJourney))
        openDeepLink()
        void flushOutbox()
        if (remoteEnabled()) {
          void runImport().then(async (did) => {
            if (did) applyRemote(await loadTrips())
          })
        }
      },
      (e: unknown) => setError(e instanceof Error ? e.message : String(e)),
    )
  }, [setData, setRepoTrips, applyRemote, flushOutbox, runImport, userId, guest])

  // Realtime on trips: a change reloads trips_latest. Saves that waited are sent when the connection is back
  useEffect(() => {
    if (!remoteEnabled() || !userId) return
    const reload = () => {
      loadTrips().then(applyRemote, () => {})
    }
    const stop = subscribeTrips(reload)
    const online = () => {
      void flushOutbox()
      reload()
    }
    window.addEventListener('online', online)
    return () => {
      stop()
      window.removeEventListener('online', online)
    }
  }, [userId, applyRemote, flushOutbox])

  // Bookings are owner only, so they wait for the signed in user. Signed out the list is empty, and a failed read keeps the last one
  const setBookings = useStore((s) => s.setBookings)
  useEffect(() => {
    if (!remoteEnabled() || !userId) {
      setBookings([])
      return
    }
    // only the latest read counts, so a slow older answer never overwrites a newer one
    let latest = 0
    const reload = () => {
      const n = ++latest
      loadBookings().then((b) => {
        if (n === latest) setBookings(b)
      }, () => {})
    }
    reload()
    const stop = subscribeBookings(reload)
    window.addEventListener('online', reload)
    return () => {
      latest = -1
      stop()
      window.removeEventListener('online', reload)
    }
  }, [userId, setBookings])

  // Places to stay are owner only as well, read the same way. They live only in the store, never in a built file
  const setLodgings = useStore((s) => s.setLodgings)
  useEffect(() => {
    if (!remoteEnabled() || !userId) {
      setLodgings([])
      return
    }
    let latest = 0
    const reload = () => {
      const n = ++latest
      loadLodgings().then((l) => {
        if (n === latest) setLodgings(l)
      }, () => {})
    }
    // one live fetch writes many rows, so a change reloads once 300 ms after the last one
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = () => {
      clearTimeout(timer)
      timer = setTimeout(reload, 300)
    }
    reload()
    const stop = subscribeLodgings(soon)
    window.addEventListener('online', reload)
    return () => {
      latest = -1
      clearTimeout(timer)
      stop()
      window.removeEventListener('online', reload)
    }
  }, [userId, setLodgings])

  // a finished build swaps the changed files in with no reload. The strip says when builds have stopped
  const [build, setBuild] = useState<DeriveState | null>(null)
  useEffect(() => {
    if (!dataBase() || !remoteEnabled() || !userId) return
    const swapIn = async () => {
      if (!(await refresh()).length) return
      // the route map and the pair prices hold their own copy, so they read the new build too
      dataChanged([clearRouteData, clearPairDates])
      const [d, rows] = await Promise.all([loadData(), loadTrips()])
      setData({ ...d, inout: withTripWays(d.inout, rows) })
    }
    const check = () => void swapIn().catch(() => {})
    void loadDeriveState().then(setBuild)
    const stop = subscribeBuilds((s) => {
      setBuild(s)
      check()
    })
    check()
    window.addEventListener('focus', check)
    return () => {
      stop()
      window.removeEventListener('focus', check)
    }
  }, [userId, setData])

  useEffect(() => useStore.subscribe(syncAddress), [])

  // a flight picked on Momondo lands in a new tab, and a tab already on the trip follows
  useEffect(() => {
    // with Supabase, Realtime covers other tabs
    if (remoteEnabled()) return
    const follow = (e: StorageEvent) => {
      if (e.key === CURRENT_KEY) useStore.getState().followTab(e.newValue)
    }
    window.addEventListener('storage', follow)
    return () => window.removeEventListener('storage', follow)
  }, [])

  if (remoteEnabled() && !auth.ready) return <div className="app"><main className="main" /></div>
  if (remoteEnabled() && !auth.session && guest !== 'looking') {
    // a shared link waits a moment for the guest view rather than showing the sign in screen
    if (!guest && shareParam(window.location.search)) return <div className="app"><main className="main" /></div>
    return <SignIn onBack={guest === 'signing-in' ? () => setGuest('looking') : undefined} />
  }
  if (consent && auth.session) return <Consent id={consent} token={auth.session.access_token} onClose={closeConsent} />
  if (error) {
    return (
      <div className="app">
        <main className="main">
          <div className="card load-err" role="alert">
            <p className="load-err-t"><Warn s={16} /> Could not load the trip data</p>
            <p className="mono small">{error}</p>
            <p className="small muted">Check the connection and open the page again.</p>
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

  return (
    <div className={'app' + (screen === 'map' ? ' wide' : '')}>
      <a className="skip" href="#main">Skip to content</a>
      <header className="top">
        <div className="top-in">
          <div className="brand">
            <h1 className="brand-mark" translate="no">LatAm</h1>
            <span className="brand-dates">Dec 2026 to Feb 2027</span>
          </div>
          <Tabs screen={screen} go={go} />
          <div className="fresh-slot">
            <Freshness meta={data.meta} />
            {remoteEnabled() && userId && <ProfileButton ownerId={userId} />}
            {remoteEnabled() && !userId && <button type="button" className="btn small" onClick={() => setGuest('signing-in')}>Sign in</button>}
          </div>
        </div>
      </header>
      <main className="main" id="main" tabIndex={-1}>
        <DataStrip state={build} />
        {screen === 'map' && <MapScreen />}
        {screen === 'trips' && <TripsScreen data={data} />}
      </main>
      <QuoteSheet />
    </div>
  )
}
