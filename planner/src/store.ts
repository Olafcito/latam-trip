import { create } from 'zustand'
import type { AppData, Way } from './data/types'
import { DEFAULT_FILTERS, type Filters } from './lib/options'
import { journeyIsValid, newJourney, type Journey, type Place } from './lib/journey'
import { applyTrips, hopBetween, type LegFacts } from './lib/mapTrips'
import type { TripLeg, TripState } from '@map/data/trips'
import type { Mode } from './data/types'
import { localOnly, mergeTrips, retireSeeds } from './lib/repoTrips'

const FILTERS_KEY = 'latam-planner.filters'
/** the browser's own trips: every trip except a table trip it never changed */
const SAVED_KEY = 'latam-planner.journeys'
const CURRENT_KEY = 'latam-planner.current'
/** table trips deleted in this browser, by id, with the version deleted (a newer version shows again) */
const HIDDEN_KEY = 'latam-planner.hidden'
/** the old seed import: which seeded trips this browser was given. Read once when the table trips arrive */
const SEEDED_KEY = 'latam-planner.seeded'
const SEED_FILE_KEY = 'latam-planner.seed-file'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // storage blocked or full: the app keeps working for this session
  }
}

function forget(key: string) {
  try {
    localStorage.removeItem(key)
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
  /** open a saved journey on the map */
  openSaved: (j: Journey) => void
  /** open a journey's dashboard on the Trips tab */
  openTrip: (j: Journey) => void
  /** leave the open trip: the map shows nothing and Trips shows the landing page */
  closeTrip: () => void

  /** the stop the trip is being built from, as an index into its places; null means the last one */
  cursor: number | null
  setCursor: (i: number | null) => void
  /** move the cursor to a stop by its map place (the last visit when it appears twice) */
  cursorTo: (node: string) => void
  /** the map's numbers for hops the planner's network lacks, set once the map has loaded */
  legFacts: LegFacts | null
  setLegFacts: (f: LegFacts) => void
  /** a leg from the map goes in after the cursor, and the cursor moves on to it */
  insertLeg: (leg: TripLeg) => void
  removeStop: (i: number) => void
  /** move a stop to another position in the route (the landing stop stays first) */
  moveStop: (from: number, to: number) => void

  /** every trip in the list: the browser's own trips and the table trips it has no copy of */
  saved: Journey[]
  saveJourney: (name: string) => void
  deleteSaved: (id: string) => void
  importJourneys: (list: unknown) => number
  /** the trips table of the repo (data/web/trips.json), latest version of each */
  repo: Journey[]
  /** table trips deleted in this browser: id to the version deleted */
  hidden: Record<string, number>
  /** the table trips arrived: list them next to the browser's own trips */
  setRepoTrips: (repo: Journey[]) => void
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
  /** a trip edit from the route map, read back into journeys */
  applyMapTrips: (after: TripState, facts?: LegFacts) => void
}

export const useStore = create<State>((set, get) => ({
  data: null,
  setData: (data) => set({ data }),
  screen: 'trips',
  view: 'home',
  go: (screen, view) => set(view ? { screen, view } : { screen }),

  filters: { ...DEFAULT_FILTERS, ...read<Partial<Filters>>(FILTERS_KEY, {}) },
  setFilters: (f) => {
    const filters = { ...get().filters, ...f }
    write(FILTERS_KEY, filters)
    set({ filters })
  },
  resetFilters: () => {
    write(FILTERS_KEY, DEFAULT_FILTERS)
    set({ filters: { ...DEFAULT_FILTERS } })
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
    set({ journey, mapOpen: true, screen: 'map', view: 'trip', cursor: null, paneMini: false })
  },
  startOnMap: (wayIn, wayHome, optionId) => get().startJourney(wayIn, wayHome, optionId),
  setJourney: (journey) => {
    write(CURRENT_KEY, journey)
    set({ journey })
  },
  openSaved: (journey) => {
    write(CURRENT_KEY, journey)
    set({ journey, mapOpen: true, screen: 'map', view: 'trip', cursor: null, paneMini: false, notice: null })
  },
  openTrip: (journey) => {
    write(CURRENT_KEY, journey)
    set({ journey, mapOpen: true, screen: 'trips', view: 'trip', cursor: null, notice: null })
  },
  closeTrip: () => set({ mapOpen: false, screen: 'trips', view: 'home', cursor: null }),

  cursor: null,
  setCursor: (i) => {
    const j = get().journey
    set({ cursor: j && i != null && i < j.places.length - 1 ? i : null })
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
    get().setJourney({ ...j, places })
    get().setCursor(at + added.length)
  },
  removeStop: (i) => {
    const { journey: j, cursor } = get()
    if (!j || i <= 0 || i >= j.places.length) return
    const places = rehop(j.places.filter((_, k) => k !== i), get())
    get().setJourney({ ...j, places })
    if (cursor != null) get().setCursor(cursor > i ? cursor - 1 : cursor === i ? i - 1 : cursor)
  },
  moveStop: (from, to) => {
    const j = get().journey
    if (!j || from <= 0 || to <= 0 || from === to || from >= j.places.length || to >= j.places.length) return
    const list = [...j.places]
    const [p] = list.splice(from, 1)
    list.splice(to, 0, p)
    get().setJourney({ ...j, places: rehop(list, get()) })
    get().setCursor(to)
  },

  saved: read<unknown[]>(SAVED_KEY, []).filter(journeyIsValid),
  saveJourney: (name) => {
    const j = get().journey
    if (!j) return
    const copy: Journey = { ...j, id: j.id, name: name || j.name, savedAt: new Date().toISOString() }
    const saved = [...get().saved.filter((s) => s.id !== copy.id), copy]
    write(SAVED_KEY, localOnly(saved, get().repo))
    write(CURRENT_KEY, copy)
    set({ saved, journey: copy })
  },
  deleteSaved: (id) => {
    const saved = get().saved.filter((s) => s.id !== id)
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
  applyMapTrips: (after, facts) => {
    const { data, journey, saved, mapOpen, compare } = get()
    if (!data) return
    const r = applyTrips(data.inout, data.map, journey, saved, mapOpen, after, facts)
    // a new trip needs a way in and a way home to start from
    if (!r) return set({ screen: 'trips', view: 'pick' })
    write(SAVED_KEY, localOnly(r.saved, get().repo))
    if (r.current) write(CURRENT_KEY, r.current)
    else write(CURRENT_KEY, null)
    const gone = saved.filter((s) => !r.saved.some((x) => x.id === s.id)).map((s) => s.id)
    set({
      journey: r.current, saved: r.saved, hidden: hide(get(), gone), mapOpen: r.open, cursor: null,
      compare: compare.filter((c) => r.saved.some((s) => s.id === c)),
    })
  },
}))

/** Hide deleted table trips at the version deleted, so the next version of the trip shows again. */
function hide(s: { repo: Journey[]; hidden: Record<string, number> }, ids: string[]): Record<string, number> {
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
