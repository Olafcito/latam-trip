import { create } from 'zustand'
import { ownKey, readOwn } from '@map/data/ownKey'
import type { AppData, Booking, CrawledFlight, Lodging, Way } from './data/types'
import type { PlannedStay } from './lib/stays'
import { DEFAULT_FILTERS, type Filters } from './lib/options'
import { heldWayNotice, keepPaid, lockedLegs, wayHeld } from './lib/booked'
import { saveBookings } from './lib/bookings'
import { withSaved } from './lib/bookingDraft'
import { dayDiff } from './lib/format'
import { applyMove, journeyIsValid, legDay, newJourney, nodeForAirport, nodeName, pinLegs, schedule, stopGoes, totals, type Hop, type Journey, type NightMove, type Place, type Schedule } from './lib/journey'
import { applyTrips, hopBetween, type LegFacts } from './lib/mapTrips'
import type { TripLeg, TripState } from '@map/data/trips'
import type { CardRef } from '@map/map/useMapMode'
import type { Mode } from './data/types'
import { localOnly, mergeTrips, retireSeeds, rowToJourney, sameJourney, withTripWays, type TripRow } from './lib/repoTrips'
import { remoteEnabled } from './lib/supabase'
import { deleteTrip, loadTrips, projectRef, readDoc, saveTrip, sendQueued, writeDoc } from './lib/remoteTrips'
import { importBrowser } from './lib/importBrowser'
import { outbox, type FlushReport } from './lib/outbox'
import { journeyToRow } from './lib/tripRow'
import { withEnds, type WayChoice } from './lib/ways'
import { HOMES } from './lib/homes'

const FILTERS_KEY = 'latam-planner.filters'
/** the browser's own trips: every trip except a table trip it never changed */
const SAVED_KEY = 'latam-planner.journeys'
export const CURRENT_KEY = 'latam-planner.current'
/** table trips deleted in this browser, by id, with the version deleted (a newer version shows again) */
const HIDDEN_KEY = 'latam-planner.hidden'
/** the old seed import: which seeded trips this browser was given. Read once when the table trips arrive */
const SEEDED_KEY = 'latam-planner.seeded'
const SEED_FILE_KEY = 'latam-planner.seed-file'

/** The same trip content, whatever version or save time each holds. */
const sameContent = (a: Journey, b: Journey) => sameJourney({ ...a, version: 0 }, { ...b, version: 0 })

function read<T>(key: string, fallback: T): T {
  try {
    const raw = readOwn(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(ownKey(key), JSON.stringify(value))
  } catch {
    // storage blocked or full: the app keeps working for this session
  }
}

/** The filters and the home airport, kept together under the filters key. A home the list does not have is Copenhagen. */
function readFilters(): { filters: Filters; home: string } {
  const { home, ...filters } = read<Partial<Filters> & { home?: unknown }>(FILTERS_KEY, {})
  return { filters: { ...DEFAULT_FILTERS, ...filters }, home: HOMES.find((h) => h.code === home)?.code ?? 'CPH' }
}

function writeFilters(filters: Filters, home: string) {
  write(FILTERS_KEY, { ...filters, home })
}

function forget(key: string) {
  try {
    localStorage.removeItem(ownKey(key))
  } catch {
    // storage blocked: nothing to forget
  }
}

/** Two tabs: the route map (where a trip is built), and Trips (start a new trip or open a saved one). */
export type Screen = 'map' | 'trips'
/** The Trips tab: the landing page, picking the way in and way home of a new trip, or the dashboard of the open trip. */
export type TripsView = 'home' | 'pick' | 'trip'
/** An airport pair picked in the matrix: narrows the option list to flights in to one city and home from another. */
export interface Pair {
  in: string
  home: string
}

interface State {
  data: AppData | null
  setData: (d: AppData) => void
  screen: Screen
  view: TripsView
  go: (s: Screen, view?: TripsView) => void

  filters: Filters
  setFilters: (f: Partial<Filters>) => void
  resetFilters: () => void
  /** the airport every way in leaves from and every way home flies to, "CPH" */
  home: string
  setHome: (code: string) => void

  pickMode: 'options' | 'mix'
  setPickMode: (m: 'options' | 'mix') => void
  expanded: string | null
  toggleExpanded: (id: string) => void
  pair: Pair | null
  setPair: (p: Pair | null) => void
  mixIn: string | null
  mixHome: string | null
  setMix: (dir: 'in' | 'home', id: string | null) => void

  journey: Journey | null
  /** start a journey on these ways and build it on the route map */
  startJourney: (wayIn: Way, wayHome: Way, optionId: string | null) => void
  startOnMap: (wayIn: Way, wayHome: Way, optionId: string | null) => void
  setJourney: (j: Journey) => void
  /** another tab stored a trip: this tab follows when it shows the same trip */
  followTab: (stored: string | null) => void
  /** open a saved journey on the map */
  openSaved: (j: Journey) => void
  /** open a journey's dashboard on the Trips tab */
  openTrip: (j: Journey) => void
  /** leave the open trip: the map shows nothing and Trips shows the landing page */
  closeTrip: () => void

  /** the stop the trip is being built from, as an index into its places; null means the last one */
  cursor: number | null
  setCursor: (i: number | null) => void
  /** true when no stop is being built from, so the trip pane shows only the itinerary */
  idle: boolean
  /** a tap on a stop: build from it, or, when it is the stop already being built from, stop building */
  toggleCursor: (i: number) => void
  /** a tap on a stop on the map: build from it, by its map place (the last visit when it appears twice) */
  cursorTo: (node: string) => void
  /** the map's numbers for hops the planner's network lacks, set once the map has loaded */
  legFacts: LegFacts | null
  setLegFacts: (f: LegFacts) => void
  /** a leg from the map goes in after the cursor, and the cursor moves on to it */
  insertLeg: (leg: TripLeg) => void
  removeStop: (i: number) => void
  /** another place for stop i. Its two legs are new and keep the days they had */
  replaceStop: (i: number, node: string) => void
  /** move a stop to another position in the route (the landing stop stays first) */
  moveStop: (from: number, to: number) => void
  /** set the day you set out on the leg to place i, "2026-12-13", or null to let it be estimated. No other leg moves */
  setHopDate: (i: number, date: string | null) => void
  /** pick a flight for the leg to place i: its day, times and price become the leg's. null goes back to the typical numbers and keeps the day */
  setHopFlight: (i: number, flight: CrawledFlight | null) => void
  /** a press on a night stepper: the legs it moves and the nights kept at the last stop, as one change */
  moveNights: (m: NightMove) => void
  /**
   * another way in and way home for the open trip, kept as its draft. The picked way is between the same two
   * cities, but the other half of a ticket can land in or leave from another city, and that city comes in as a stop
   */
  /** whether the pick went on. A pick that would change a booked way, which is not unlocked, changes nothing */
  setWays: (choice: WayChoice) => boolean
  /** the trip whose start and end are being picked, while the picker is open for it. null for a new trip */
  pickFor: string | null
  /** open the picker to change the start and end of a trip */
  changeEndsOf: (tripId: string) => void
  /** the trip being changed takes these ways, its new end cities come in as stops, and it opens as a click in the list opens it */
  changeEnds: (wayIn: Way, wayHome: Way) => boolean
  /** a pick in the picker: the trip being changed takes the ways, or without one a new trip starts on them */
  pickWays: (wayIn: Way, wayHome: Way, optionId: string | null) => boolean

  /** every trip in the list: the browser's own trips and the table trips it has no copy of */
  saved: Journey[]
  saveJourney: (name: string) => Promise<void>
  deleteSaved: (id: string) => void
  importJourneys: (list: unknown) => number
  /** Latest version of each shared trip row. */
  repo: Journey[]
  /** table trips deleted in this browser: id to the version deleted */
  hidden: Record<string, number>
  /** the table trips arrived: list them next to the browser's own trips */
  setRepoTrips: (repo: Journey[]) => void
  /** with Supabase: the latest stored row of each trip, by id */
  rows: Record<string, TripRow>
  /** an older version of a stored trip is open: which, and how many versions the trip has. The row is what a Save builds on */
  viewing: { id: string; version: number; latest: number; row: TripRow } | null
  /** open one stored version of a trip in the trip view */
  openVersion: (row: TripRow, latest: number) => void
  /** leave the older version for the latest one */
  backToLatest: () => void
  /** the trips table changed, or was read: list its trips, and tell the user when the open trip moved under unsaved edits */
  /** `deleted` names ids deleted elsewhere, so a copy held only in this browser goes too */
  applyRemote: (rows: TripRow[], deleted?: string[]) => void
  /** send the saves waiting in the outbox, in order */
  flushOutbox: () => Promise<FlushReport | null>
  /** the one import of this browser, which runs only after cutover. Returns whether it saved anything */
  runImport: () => Promise<boolean>
  /** a one-line message on the Trips list, such as a link to a trip that does not exist */
  notice: string | null
  setNotice: (notice: string | null) => void
  compare: string[]
  toggleCompare: (id: string) => void

  /** whether the Map tab draws the current journey as its open trip */
  mapOpen: boolean
  /** the trip pane on the map is folded to a small card */
  paneMini: boolean
  setPaneMini: (mini: boolean) => void
  showOnMap: () => void
  /** a gym, city or experience the map opens when it next shows, from a row of an itinerary */
  mapCard: CardRef | null
  /** the last card opened from Trips, so that card can go back there, until the screen changes */
  mapCardFrom: CardRef | null
  openMapCard: (card: CardRef) => void
  clearMapCard: () => void
  /** a trip edit from the route map, read back into journeys */
  applyMapTrips: (after: TripState, facts?: LegFacts) => void

  /** every booking row, cancelled ones too, read live. Empty when signed out */
  bookings: Booking[]
  setBookings: (bookings: Booking[]) => void
  /** one booking row changed in place, before the reload lands */
  patchBooking: (id: string, change: Partial<Booking>) => void
  /**
   * Saves the rows of a booking and pins what they book, as a pick by hand does: leg i on the day of the first row
   * and on its flight, or the ways chosen. A way choice that would move another booked way is refused before
   * anything is saved. A row with an id updates that row, so a booking changed from its window stays one booking.
   */
  markBooked: (rows: Partial<Booking>[], leg: { i: number; flight?: CrawledFlight | null } | { way: 'in' | 'home'; choice?: WayChoice }) => Promise<{ ok: true; ids: string[] } | { ok: false; message: string }>
  /**
   * the booked leg (its place index) or way whose booking is being changed. A booked leg or way holds its day
   * until then, and holds it again once the change is made
   */
  unlocked: number | 'in' | 'home' | null
  setUnlocked: (unlocked: number | 'in' | 'home' | null) => void

  /** every place to stay with its rooms and prices, hidden ones too, read live. Empty when signed out */
  lodgings: Lodging[]
  setLodgings: (lodgings: Lodging[]) => void
  /** where you plan to sleep at place i, in order from its first night, kept as the trip's draft. An empty list takes them away */
  setStays: (i: number, stays: PlannedStay[]) => void
}

export const useStore = create<State>((set, get) => ({
  lodgings: [],
  setLodgings: (lodgings) => set({ lodgings }),
  setStays: (i, stays) => {
    const j = get().journey
    if (!j?.places[i]) return
    get().setJourney({
      ...j,
      places: j.places.map((q, k) => {
        if (k !== i) return q
        const { stays: _gone, ...rest } = q
        return stays.length ? { ...rest, stays: stays.map((s) => ({ ...s })) } : rest
      }),
    })
  },
  bookings: [],
  setBookings: (bookings) => set({ bookings }),
  patchBooking: (id, change) => set({ bookings: get().bookings.map((b) => (b.id === id ? { ...b, ...change } : b)) }),
  markBooked: async (rows, leg) => {
    const s = get()
    const { journey: j, data } = s
    if (!j || !data || !rows.length) return { ok: false, message: 'Open a trip first.' }
    let ways: { wayIn: Way; wayHome: Way } | null = null
    if ('way' in leg && leg.choice) {
      // the rows being saved are the booking being changed, so they do not hold the ways they replace
      const changing = new Set(rows.map((r) => r.id).filter(Boolean))
      const k = keptWays(j, leg.choice.wayIn, leg.choice.wayHome, { ...s, bookings: s.bookings.filter((b) => !changing.has(b.id)) })
      if (k.kept) return { ok: false, message: heldWayNotice(k.wayIn.id !== leg.choice.wayIn.id ? 'in' : 'home') }
      ways = k
    }
    // a row taken out of a shared ticket hands its price to the rows left on it, so the ids past the rows are theirs
    const all = keepPaid(s.bookings, rows)
    const saved = await saveBookings(all)
    if (!saved.ok) return saved
    set({ bookings: withSaved(get().bookings, all, saved.ids) })
    const ids = saved.ids.slice(0, rows.length)
    const now = get().journey
    // another trip opened while the rows were saved, so this one is left as it is
    if (!now || now.id !== j.id) return { ok: true, ids }
    if (ways) {
      if (ways.wayIn.id !== now.wayIn || ways.wayHome.id !== now.wayHome) get().setJourney(withEnds(now, data.inout, data.map, ways.wayIn, ways.wayHome))
    } else if ('i' in leg) {
      const h = now.places[leg.i]?.hop
      const day = rows[0].depart?.slice(0, 10)
      const f = leg.flight ?? null
      if (h && day && (h.date !== day || (f && h.flight?.quote_id !== f.quote_id))) {
        const base = pinned(now, get())
        const hop = f ? withFlight(h, f) : { ...h, date: day }
        get().setJourney({ ...base, places: base.places.map((q, k) => (k === leg.i ? { ...q, hop } : q)) })
      }
    }
    set({ unlocked: null })
    return { ok: true, ids }
  },
  unlocked: null,
  setUnlocked: (unlocked) => set({ unlocked }),
  data: null,
  setData: (data) => {
    const { viewing } = get()
    // an older version keeps the ways it was saved with, and is never written as this browser's draft
    if (viewing) {
      set({ data: { ...data, inout: withTripWays(data.inout, [viewing.row]) } })
      const j = get().journey
      if (j) set({ journey: settled(j, get()) })
      return
    }
    set({ data })
    // a trip stored before a leg lost its flight on another day
    const j = get().journey
    if (j) get().setJourney(j)
  },
  screen: 'trips',
  view: 'home',
  // a view of its own leaves the picker or opens it for a new trip, so it forgets the trip being changed.
  // A tab press keeps it, so a look at the map and back is still the change of that trip
  go: (screen, view) => set({ mapCardFrom: null, ...(view ? { screen, view, pickFor: null } : { screen }) }),

  ...readFilters(),
  setFilters: (f) => {
    const filters = { ...get().filters, ...f }
    writeFilters(filters, get().home)
    set({ filters })
  },
  resetFilters: () => {
    writeFilters(DEFAULT_FILTERS, get().home)
    set({ filters: { ...DEFAULT_FILTERS } })
  },
  setHome: (home) => {
    if (home === get().home) return
    writeFilters(get().filters, home)
    // a pair or a way picked from the old home does not fly from the new one
    set({ home, pair: null, expanded: null, mixIn: null, mixHome: null })
  },

  pickMode: 'options',
  setPickMode: (pickMode) => set({ pickMode }),
  expanded: null,
  toggleExpanded: (id) => set({ expanded: get().expanded === id ? null : id }),
  pair: null,
  setPair: (pair) => set({ pair, expanded: null }),
  mixIn: null,
  mixHome: null,
  setMix: (dir, id) => set(dir === 'in' ? { mixIn: id } : { mixHome: id }),

  journey: (() => {
    const j = read<unknown>(CURRENT_KEY, null)
    return journeyIsValid(j) ? j : null
  })(),
  startJourney: (wayIn, wayHome, optionId) => {
    const data = get().data
    if (!data) return
    const journey = newJourney(data.inout, wayIn, wayHome, optionId)
    write(CURRENT_KEY, journey)
    set({ journey, unlocked: null, pickFor: null, mapOpen: true, screen: 'map', view: 'trip', cursor: null, idle: false, paneMini: false })
  },
  startOnMap: (wayIn, wayHome, optionId) => get().startJourney(wayIn, wayHome, optionId),
  setJourney: (next) => {
    const journey = settled(next, get())
    write(CURRENT_KEY, journey)
    set({ journey, ...another(get(), journey) })
  },
  followTab: (stored) => {
    const shown = get().journey
    if (!shown || !stored) return
    try {
      const next: unknown = JSON.parse(stored)
      if (journeyIsValid(next) && next.id === shown.id) set({ journey: next })
    } catch {
      // what another tab stored is not a trip, so this tab stays as it is
    }
  },
  openSaved: (next) => {
    const journey = settled(next, get())
    write(CURRENT_KEY, journey)
    set({ journey, ...another(get(), journey), viewing: null, pickFor: null, mapOpen: true, screen: 'map', view: 'trip', cursor: null, idle: false, paneMini: false, notice: null })
  },
  openTrip: (next) => {
    const journey = settled(next, get())
    write(CURRENT_KEY, journey)
    set({ journey, ...another(get(), journey), viewing: null, pickFor: null, mapOpen: true, screen: 'trips', view: 'trip', cursor: null, idle: false, notice: null })
  },
  closeTrip: () => set({ viewing: null, pickFor: null, mapOpen: false, screen: 'trips', view: 'home', cursor: null, idle: false }),

  cursor: null,
  idle: false,
  setCursor: (i) => {
    const j = get().journey
    set({ cursor: j && i != null && i < j.places.length - 1 ? i : null, idle: false })
  },
  toggleCursor: (i) => {
    const { journey: j, cursor, idle } = get()
    if (!j) return
    if (!idle && i === (cursor ?? j.places.length - 1)) set({ idle: true })
    else get().setCursor(i)
  },
  cursorTo: (node) => {
    const j = get().journey
    if (!j) return
    const i = j.places.map((p) => p.node).lastIndexOf(node)
    if (i >= 0) get().setCursor(i)
  },
  legFacts: null,
  setLegFacts: (legFacts) => set({ legFacts }),
  insertLeg: (leg) => {
    const { journey: j, cursor } = get()
    if (!j) return
    const at = cursor ?? j.places.length - 1
    const here = j.places[at].node
    // a leg from somewhere else first goes there, then on
    const added: Place[] = leg.from === here ? [] : [{ node: leg.from, hop: null }]
    added.push({ node: leg.to, hop: null })
    const places = rehop([...j.places.slice(0, at + 1), ...added, ...j.places.slice(at + 1)], get(), leg.mode)
    // the stops move along, so an unlocked leg would be another leg now
    set({ unlocked: null })
    get().setJourney({ ...j, places })
    get().setCursor(at + added.length)
  },
  removeStop: (i) => {
    const { journey: j, cursor } = get()
    if (!j || i <= 0 || i >= j.places.length) return
    const sched = scheduleOf(j, get().data)
    const move = sched && stopGoes(j, sched, i, lockedOf(j, sched, get()))
    const places = rehop(j.places.filter((_, k) => k !== i), get())
    set({ unlocked: null })
    get().setJourney(move ? applyMove({ ...j, places }, move) : { ...j, places })
    if (cursor != null) get().setCursor(cursor > i ? cursor - 1 : cursor === i ? i - 1 : cursor)
  },
  replaceStop: (i, node) => {
    const j = get().journey
    if (!j || i <= 0 || i >= j.places.length || j.places[i].node === node) return
    // a leg with no day of its own stays floating, so the even share does not change
    const dayOf = (h: Hop | null | undefined) => (h && (h.date || h.flight) ? legDay(h, '') : null)
    const days = [dayOf(j.places[i].hop), dayOf(j.places[i + 1]?.hop)]
    const open = j.places.map((p, k) => (k === i ? { node, hop: null } : k === i + 1 ? { ...p, hop: null } : p))
    const places = rehop(open, get()).map((p, k) => {
      const date = k === i ? days[0] : k === i + 1 ? days[1] : null
      return date && p.hop ? { ...p, hop: { ...p.hop, date } } : p
    })
    get().setJourney({ ...j, places })
  },
  moveStop: (from, to) => {
    const j = get().journey
    if (!j || from <= 0 || to <= 0 || from === to || from >= j.places.length || to >= j.places.length) return
    const list = [...j.places]
    const [p] = list.splice(from, 1)
    list.splice(to, 0, p)
    set({ unlocked: null })
    get().setJourney({ ...j, places: rehop(list, get()) })
    get().setCursor(to)
  },
  setHopDate: (i, date) => {
    const j = get().journey
    const p = j?.places[i]
    if (!j || !p?.hop || holds(j, i, get())) return
    const { date: _, ...hop } = p.hop
    const base = pinned(j, get(), !date)
    const places = base.places.map((q, k) => (k === i ? { ...q, hop: date ? { ...hop, date } : hop } : q))
    get().setJourney({ ...base, places })
    if (get().unlocked === i) set({ unlocked: null })
  },
  moveNights: (m) => {
    const j = get().journey
    if (!j) return
    get().setJourney(applyMove(j, m))
  },
  setHopFlight: (i, flight) => {
    const j = get().journey
    const h = j?.places[i]?.hop
    if (!j || !h || holds(j, i, get())) return
    const hop = flight ? withFlight(h, flight) : withoutFlight(h, get())
    const base = pinned(j, get(), !flight)
    get().setJourney({ ...base, places: base.places.map((q, k) => (k === i ? { ...q, hop } : q)) })
    if (get().unlocked === i) set({ unlocked: null })
  },
  setWays: (choice) => {
    const s = get()
    const { journey: j, data } = s
    if (!j || !data) return false
    const ways = keptWays(j, choice.wayIn, choice.wayHome, s)
    // a pick goes on whole or not at all, so the other half of a ticket never goes in next to a booked way
    if (ways.kept) return false
    s.setJourney(withEnds(j, data.inout, data.map, ways.wayIn, ways.wayHome))
    relock(j, ways, get, set)
    return true
  },
  pickFor: null,
  changeEndsOf: (tripId) => {
    // an older version on screen is only looked at, its ends are not changed
    if (get().viewing?.id === tripId) return
    get().go('trips', 'pick')
    set({ pickFor: tripId })
  },
  changeEnds: (wayIn, wayHome) => {
    const s = get()
    const j = changing(s) ?? (s.pickFor ? null : s.journey)
    if (!j || !s.data) return false
    const ways = keptWays(j, wayIn, wayHome, s)
    // a pick goes on whole or not at all, as in setWays
    if (ways.kept) return false
    // an older version on screen, or a notice about the trip open before, does not stay with the changed trip
    s.openTrip(withEnds(j, s.data.inout, s.data.map, ways.wayIn, ways.wayHome))
    relock(j, ways, get, set)
    return true
  },
  pickWays: (wayIn, wayHome, optionId) => {
    const s = get()
    if (changing(s)) return s.changeEnds(wayIn, wayHome)
    s.startOnMap(wayIn, wayHome, optionId)
    return true
  },

  saved: read<unknown[]>(SAVED_KEY, []).filter(journeyIsValid),
  saveJourney: async (name) => {
    const j = get().journey
    if (!j) return
    const copy: Journey = { ...j, id: j.id, name: name || j.name, savedAt: new Date().toISOString() }
    if (remoteEnabled()) return saveRemote(copy, get, set)
    const saved = [...get().saved.filter((s) => s.id !== copy.id), copy]
    write(SAVED_KEY, localOnly(saved, get().repo))
    write(CURRENT_KEY, copy)
    set({ saved, journey: copy })
  },
  deleteSaved: (id) => {
    const saved = get().saved.filter((s) => s.id !== id)
    if (remoteEnabled()) {
      const stored = !!get().rows[id]
      write(SAVED_KEY, localOnly(saved, get().repo))
      set({ saved, compare: get().compare.filter((c) => c !== id) })
      if (stored) removeRemote(id, get, set)
      return
    }
    write(SAVED_KEY, localOnly(saved, get().repo))
    set({ saved, hidden: hide(get(), [id]), compare: get().compare.filter((c) => c !== id) })
  },
  importJourneys: (list) => {
    const arr = (Array.isArray(list) ? list : [list]).filter(journeyIsValid)
    const byId = new Map(get().saved.map((s) => [s.id, s]))
    for (const j of arr) byId.set(j.id, j)
    const saved = [...byId.values()]
    write(SAVED_KEY, localOnly(saved, get().repo))
    set({ saved })
    return arr.length
  },
  repo: [],
  hidden: read<Record<string, number>>(HIDDEN_KEY, {}),
  setRepoTrips: (repo) => {
    const was = get()
    let local = localOnly(was.saved, was.repo)
    let hidden = was.hidden
    let journey = was.journey
    const seeded = read<string[] | null>(SEEDED_KEY, null)
    if (seeded && repo.length) {
      // the seeded trips moved into the table: an untouched seeded copy gives way to its table trip
      const r = retireSeeds(local, repo, seeded)
      local = r.local
      hidden = { ...r.hidden, ...hidden }
      const open = journey
      if (open && seeded.includes(open.id) && !local.some((j) => j.id === open.id)) {
        const table = repo.find((t) => t.id === open.id)
        if (table) {
          journey = table
          write(CURRENT_KEY, journey)
        }
      }
      write(SAVED_KEY, local)
      write(HIDDEN_KEY, hidden)
      forget(SEEDED_KEY)
      forget(SEED_FILE_KEY)
    }
    set({ repo, hidden, journey, saved: mergeTrips(local, repo, hidden) })
  },
  rows: {},
  viewing: null,
  openVersion: (row, latest) => {
    const d = get().data
    // the journey is not written as the open draft: looking at an old version leaves nothing behind in this browser
    const journey = rowToJourney(row)
    set({
      journey, ...another(get(), journey),
      viewing: { id: row.id, version: row.version, latest, row },
      ...(d ? { data: { ...d, inout: withTripWays(d.inout, [row]) } } : {}),
      pickFor: null, mapOpen: true, screen: 'trips', view: 'trip', cursor: null, idle: false, notice: null,
    })
  },
  backToLatest: () => {
    const { viewing, rows, data: d } = get()
    const row = viewing && rows[viewing.id]
    if (!row) return set({ viewing: null })
    const journey = rowToJourney(row)
    write(CURRENT_KEY, journey)
    set({ journey, viewing: null, cursor: null, notice: null, ...(d ? { data: { ...d, inout: withTripWays(d.inout, [row]) } } : {}) })
  },
  applyRemote: (list, deleted = []) => {
    const was = get()
    const rows = Object.fromEntries(list.map((r) => [r.id, r]))
    const repo = list.map(rowToJourney)
    // trips held only on this device stay, a trip the table had comes from the table
    const local = was.saved.filter((j) => !was.rows[j.id] && !was.repo.some((r) => r.id === j.id) && !rows[j.id] && !deleted.includes(j.id))
    let journey = was.journey
    let notice = was.notice
    const open = journey
    let viewing = was.viewing
    if (viewing && rows[viewing.id]) viewing = { ...viewing, latest: rows[viewing.id].version }
    if (open && viewing?.id === open.id) {
      // an older version stays as it is while the table moves on
    } else if (open) {
      const next = rows[open.id]
      const base = was.rows[open.id]
      // unsaved edits: the journey differs from the row it was opened from
      const edited = !!base && !sameJourney(rowToJourney(base), open)
      if (next && base && next.version > base.version) {
        // a row with the content this window holds is its own save coming back, not another window's
        if (sameContent(rowToJourney(next), open)) {
          journey = rowToJourney(next)
          write(CURRENT_KEY, journey)
        } else if (edited) notice = 'This trip has a newer saved version from another window. Your edits are still here and nothing was replaced.'
        else {
          journey = rowToJourney(next)
          write(CURRENT_KEY, journey)
        }
      } else if (!next && base) {
        notice = 'This trip was deleted in another window. It stays open here until you close it.'
      }
    }
    // a trip the browser holds only locally stays in the list, a stored trip comes from the table
    const merged = mergeTrips(local, repo)
    set({ rows, repo, journey, notice, viewing, saved: merged })
    const d = was.data
    // the version on screen keeps its own ways over the latest row's
    if (d) set({ data: { ...d, inout: withTripWays(d.inout, viewing ? [...list, viewing.row] : list) } })
  },
  runImport: async () => {
    const data = get().data
    if (!remoteEnabled() || !data) return false
    const deps = {
      storage: localStorage,
      projectRef: projectRef(),
      inout: data.inout,
      cutoverDone: async () => (await readDoc('cutover_done')) != null,
      readDoc,
      writeDoc,
      latest: loadTrips,
      save: saveTrip,
      remove: async (id: string) => ({ ok: (await deleteTrip(id)).ok }),
      totals: (j: Journey) => totals(data, j, scheduleOf(j, data), get().bookings, get().lodgings),
    }
    try {
      const a = await importBrowser(deps)
      return a.imported.length > 0 || a.deleted.length > 0
    } catch {
      return false
    }
  },
  flushOutbox: async () => {
    if (!remoteEnabled() || !outbox.size()) return null
    const rep = await outbox.flush(sendQueued)
    if (rep.dropped.length) {
      const names = rep.dropped.map((d) => d.row.name).join(', ')
      get().setNotice(`Saves that waited could not be stored: ${names}. ${rep.dropped[0].reason === 'deleted' ? 'The trip was deleted in another window.' : rep.dropped[0].reason}`)
    } else if (rep.sent) get().setNotice(null)
    return rep
  },
  notice: null,
  setNotice: (notice) => set({ notice }),
  compare: [],
  toggleCompare: (id) => {
    const c = get().compare
    set({ compare: c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? [...c.slice(1), id] : [...c, id] })
  },

  mapOpen: true,
  paneMini: false,
  setPaneMini: (paneMini) => set({ paneMini }),
  showOnMap: () => set({ mapOpen: true, screen: 'map' }),
  mapCard: null,
  mapCardFrom: null,
  openMapCard: (mapCard) => set({ mapCard, mapCardFrom: mapCard, mapOpen: true, screen: 'map' }),
  clearMapCard: () => set({ mapCard: null }),
  applyMapTrips: (after, facts) => {
    const { data, journey, saved, mapOpen, compare } = get()
    if (!data) return
    const r = applyTrips(data.inout, data.map, journey, saved, mapOpen, after, facts)
    // a new trip needs a way in and a way home to start from
    if (!r) return set({ screen: 'trips', view: 'pick', pickFor: null })
    write(SAVED_KEY, localOnly(r.saved, get().repo))
    if (r.current) write(CURRENT_KEY, r.current)
    else write(CURRENT_KEY, null)
    const gone = saved.filter((s) => !r.saved.some((x) => x.id === s.id)).map((s) => s.id)
    set({
      journey: r.current, saved: r.saved, hidden: hide(get(), gone), mapOpen: r.open, cursor: null, idle: false,
      compare: compare.filter((c) => r.saved.some((s) => s.id === c)),
    })
    if (!remoteEnabled()) return
    for (const id of gone) if (get().rows[id]) removeRemote(id, get, set)
    // every trip the map added or changed goes to the table, so the button does not say Saved for a trip only this browser holds
    const before = (id: string) => saved.find((s) => s.id === id) ?? (journey?.id === id ? journey : undefined)
    const touched = r.saved.filter((j) => {
      const b = before(j.id)
      return !b || !sameJourney(b, j)
    })
    void touched.reduce((p, j) => p.then(() => saveRemote(j, get, set)), Promise.resolve())
  },
}))

/**
 * The trip the picker changes the start and end of: the open trip, or the saved trip of that id when another trip
 * opened since. null for a new trip, and when that trip is gone.
 */
export function changing(s: { pickFor: string | null; journey: Journey | null; saved: Journey[] }): Journey | null {
  if (!s.pickFor) return null
  return s.journey?.id === s.pickFor ? s.journey : (s.saved.find((j) => j.id === s.pickFor) ?? null)
}

/**
 * Save through Supabase. The trip shows as saved at once. A save that cannot reach the database goes to the
 * outbox with a notice, and a trip deleted in another window is not brought back.
 */
async function saveRemote(copy: Journey, get: () => State, set: (p: Partial<State>) => void): Promise<void> {
  const s = get()
  const { data } = s
  if (!data) return s.setNotice('The data has not loaded yet, so nothing was saved.')
  let row: TripRow
  try {
    row = journeyToRow(copy, (s.viewing?.id === copy.id ? s.viewing.row : s.rows[copy.id]) ?? null, data.inout, totals(data, copy, scheduleOf(copy, data), s.bookings, s.lodgings))
  } catch (e) {
    return s.setNotice(e instanceof Error ? e.message : String(e))
  }
  // only the trip that is open on the screen changes the screen. A trip saved from the map stays out of it
  const isOpen = () => get().journey?.id === copy.id
  const waits = (reason: 'offline' | 'session') => {
    const open = isOpen()
    if (open) write(CURRENT_KEY, copy)
    set({ viewing: null, ...(open ? { journey: copy } : {}), saved: [...get().saved.filter((x) => x.id !== copy.id), copy] })
    noteQueued(get, reason)
  }
  // the earlier waiting saves go first, so versions keep the order of the presses
  if (outbox.size()) {
    outbox.enqueue(row)
    const rep = await get().flushOutbox()
    if (outbox.size()) return waits(rep?.stalled ?? 'offline')
    const open = isOpen()
    if (open) write(CURRENT_KEY, copy)
    set({ viewing: null, ...(open ? { journey: copy } : {}), saved: [...get().saved.filter((x) => x.id !== copy.id), copy] })
    return
  }
  const r = await saveTrip(row)
  if (r.status === 'saved') {
    const stored: TripRow = { ...row, version: r.version }
    const rows = { ...get().rows, [copy.id]: r.skipped && get().rows[copy.id] ? get().rows[copy.id] : stored }
    // the screen holds the trip as the table does, so it is not left changed against its own save
    const mine = rowToJourney(rows[copy.id])
    const saved = [...get().saved.filter((x) => x.id !== copy.id), mine]
    const open = isOpen()
    if (open) write(CURRENT_KEY, mine)
    const d = get().data
    set({ rows, saved, viewing: null, ...(open ? { journey: mine } : {}), ...(d ? { data: { ...d, inout: withTripWays(d.inout, Object.values(rows)) } } : {}) })
  } else if (r.status === 'queued') {
    outbox.enqueue(row)
    waits(r.reason)
  } else if (r.status === 'deleted') {
    get().setNotice('This trip was deleted in another window, so this save was not stored. Nothing was brought back.')
  } else get().setNotice(r.message)
}

/** Delete a stored trip. The trip leaves the list at once, and comes back with a notice when the delete did not happen. */
function removeRemote(id: string, get: () => State, set: (p: Partial<State>) => void): void {
  void deleteTrip(id).then((r) => {
    if (r.ok) set({ rows: Object.fromEntries(Object.entries(get().rows).filter(([k]) => k !== id)) })
    else {
      get().applyRemote(Object.values(get().rows))
      get().setNotice(`The trip could not be deleted, so it stays. ${r.message}`)
    }
  })
}

function noteQueued(get: () => State, reason: 'offline' | 'session') {
  get().setNotice(
    reason === 'session'
      ? 'You are signed out, so this save waits on this device. Sign in again and it is sent.'
      : 'There is no connection, so this save waits on this device and is sent when you are back online.',
  )
}

/** Hide deleted table trips at the version deleted, so the next version of the trip shows again. */
function hide(s: { repo: Journey[]; hidden: Record<string, number> }, ids: string[]): Record<string, number> {
  // with Supabase a delete is a soft delete in the table, so nothing is hidden per browser
  if (remoteEnabled()) return s.hidden
  const add = s.repo.filter((r) => ids.includes(r.id))
  if (!add.length) return s.hidden
  const hidden = { ...s.hidden }
  for (const r of add) hidden[r.id] = r.version ?? 1
  write(HIDDEN_KEY, hidden)
  return hidden
}

/**
 * Hops after the places moved: a hop that still joins its two places stays (with its picked
 * flight), the rest are looked up again. A new place takes the mode its leg was added with.
 */
/** The days of a trip, or null while the data is missing or its flights are gone. */
function scheduleOf(j: Journey, data: AppData | null): Schedule | null {
  const wi = data?.inout.ways[j.wayIn]
  const wh = data?.inout.ways[j.wayHome]
  if (!data || !wi || !wh) return null
  return schedule(j, wi, wh, nodeForAirport(data.inout, wh.from), (n) => nodeName(data.map, data.inout, n))
}

/** The legs of the trip booked on the day they show. No night move and no day set by hand moves them. */
function lockedOf(j: Journey, sched: Schedule | null, s: { data: AppData | null; bookings: Booking[] }): Set<number> {
  return sched && s.data ? lockedLegs(s.bookings, s.data, j, sched) : new Set()
}

/** Whether leg i is booked on its day and its booking is not being changed, so it keeps that day. */
function holds(j: Journey, i: number, s: { data: AppData | null; bookings: Booking[]; unlocked: State['unlocked'] }): boolean {
  return s.unlocked !== i && s.bookings.length > 0 && lockedOf(j, scheduleOf(j, s.data), s).has(i)
}

/** The ways a change gives a trip. A booked way stays unless its booking is being changed, and kept says one stayed. */
function keptWays(j: Journey, wayIn: Way, wayHome: Way, s: { data: AppData | null; bookings: Booking[]; unlocked: State['unlocked'] }) {
  let kept = false
  const keep = (id: string, side: 'in' | 'home', next: Way): Way => {
    const now = s.data?.inout.ways[id]
    if (!s.data || !wayHeld(s.bookings, s.data, now, next, s.unlocked === side)) return next
    kept = true
    return now!
  }
  const ways = { wayIn: keep(j.wayIn, 'in', wayIn), wayHome: keep(j.wayHome, 'home', wayHome) }
  return { ...ways, kept }
}

/** A booked way whose booking was being changed holds its day again once it has changed. */
function relock(j: Journey, ways: { wayIn: Way; wayHome: Way }, get: () => State, set: (p: Partial<State>) => void) {
  const u = get().unlocked
  if ((u === 'in' && ways.wayIn.id !== j.wayIn) || (u === 'home' && ways.wayHome.id !== j.wayHome)) set({ unlocked: null })
}

/**
 * The trip with every leg that floats pinned on the day it shows. With onlyLocked, just the booked legs,
 * so a day or flight cleared elsewhere lets the other legs share the days again and a booked leg keeps its day.
 */
function pinned(j: Journey, s: { data: AppData | null; bookings: Booking[] }, onlyLocked = false): Journey {
  const sched = scheduleOf(j, s.data)
  if (!sched) return j
  if (!onlyLocked) return pinLegs(j, sched)
  const locked = lockedOf(j, sched, s)
  return locked.size ? pinLegs(j, sched, locked) : j
}

/** An unlocked leg or way belongs to the trip it was unlocked on, so another trip opens with none. */
function another(s: { journey: Journey | null }, next: Journey): Partial<State> {
  return s.journey?.id === next.id ? {} : { unlocked: null }
}

/** A leg on its picked flight: the flight's day, times and price. A flight set aside gives way to it. */
function withFlight(h: Hop, flight: CrawledFlight): Hop {
  const { parked: _, ...hop } = h
  return {
    ...hop, flight, price_dkk: flight.price_dkk, hours: flight.hours, date: flight.depart.slice(0, 10),
    overnight: dayDiff(flight.depart, flight.arrive) > 0, observed_at: flight.observed_at ?? null,
  }
}

/** A leg with no flight: the typical numbers of the route, and its day stays. */
function withoutFlight(h: Hop, s: { data: AppData | null; legFacts: LegFacts | null }): Hop {
  const typical = s.data ? hopBetween(s.data.map, h.from, h.to, h.mode, s.legFacts ?? undefined) : null
  const known = typical?.mode === h.mode ? typical : null
  return { ...h, flight: null, price_dkk: known?.price_dkk ?? null, hours: known?.hours ?? null, overnight: known?.overnight ?? false, observed_at: null }
}

/**
 * A picked flight belongs to its day. A leg moved off that day sets the flight aside and takes the
 * typical numbers, and gets the flight back when it is on that day again.
 */
function settled(j: Journey, s: { data: AppData | null; legFacts: LegFacts | null }): Journey {
  const onDay = (f: CrawledFlight, date: string) => f.depart.slice(0, 10) === date
  const places = j.places.map((p) => {
    const h = p.hop
    if (!h?.date) return p
    if (h.flight && !onDay(h.flight, h.date)) return { ...p, hop: { ...withoutFlight(h, s), parked: h.flight } }
    if (!h.flight && h.parked && onDay(h.parked, h.date)) return { ...p, hop: withFlight(h, h.parked) }
    return p
  })
  return places.some((p, k) => p !== j.places[k]) ? { ...j, places } : j
}

function rehop(places: Place[], s: { data: AppData | null; legFacts: LegFacts | null }, mode: Mode | null = null): Place[] {
  const map = s.data?.map
  if (!map) return places
  return places.map((p, i) => {
    if (i === 0) return p.hop ? { ...p, hop: null } : p
    const from = places[i - 1].node
    if (p.hop?.overland) return p.hop.from === from ? p : { ...p, hop: { ...p.hop, from } }
    if (p.hop && p.hop.from === from && p.hop.to === p.node) return p
    return { ...p, hop: hopBetween(map, from, p.node, p.hop?.mode ?? mode, s.legFacts ?? undefined) }
  })
}
