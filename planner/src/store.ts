import { create } from 'zustand'
import type { AppData, Way } from './data/types'
import { DEFAULT_FILTERS, type Filters } from './lib/options'
import { journeyIsValid, newJourney, type Journey } from './lib/journey'
import { applyTrips, type LegFacts } from './lib/mapTrips'
import type { Trip, TripState } from '@map/data/trips'
import { seedToJourney } from './lib/seeds'

const FILTERS_KEY = 'latam-planner.filters'
const SAVED_KEY = 'latam-planner.journeys'
const CURRENT_KEY = 'latam-planner.current'
const SEEDED_KEY = 'latam-planner.seeded'

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

/** Two tabs: the route map (where a trip is built), and Trips (start a new trip or open a saved one). */
export type Screen = 'map' | 'trips'
/** The Trips tab: the landing page, or picking the way in and way home of a new trip. */
export type TripsView = 'home' | 'pick'
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
  /** leave the open trip: the map shows nothing and Trips shows the landing page */
  closeTrip: () => void

  saved: Journey[]
  saveJourney: (name: string) => void
  deleteSaved: (id: string) => void
  importJourneys: (list: unknown) => number
  /** add the ranked trips this browser has not seen yet; the first becomes the current journey when there is none */
  importSeeds: (seeds: Trip[]) => void
  compare: string[]
  toggleCompare: (id: string) => void

  /** whether the Map tab draws the current journey as its open trip */
  mapOpen: boolean
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
    set({ journey, mapOpen: true, screen: 'map', view: 'home' })
  },
  startOnMap: (wayIn, wayHome, optionId) => get().startJourney(wayIn, wayHome, optionId),
  setJourney: (journey) => {
    write(CURRENT_KEY, journey)
    set({ journey })
  },
  openSaved: (journey) => {
    write(CURRENT_KEY, journey)
    set({ journey, mapOpen: true, screen: 'map', view: 'home' })
  },
  closeTrip: () => set({ mapOpen: false, screen: 'trips', view: 'home' }),

  saved: read<unknown[]>(SAVED_KEY, []).filter(journeyIsValid),
  saveJourney: (name) => {
    const j = get().journey
    if (!j) return
    const copy: Journey = { ...j, id: j.id, name: name || j.name, savedAt: new Date().toISOString() }
    const saved = [...get().saved.filter((s) => s.id !== copy.id), copy]
    write(SAVED_KEY, saved)
    write(CURRENT_KEY, copy)
    set({ saved, journey: copy })
  },
  deleteSaved: (id) => {
    const saved = get().saved.filter((s) => s.id !== id)
    write(SAVED_KEY, saved)
    set({ saved, compare: get().compare.filter((c) => c !== id) })
  },
  importJourneys: (list) => {
    const arr = (Array.isArray(list) ? list : [list]).filter(journeyIsValid)
    const byId = new Map(get().saved.map((s) => [s.id, s]))
    for (const j of arr) byId.set(j.id, j)
    const saved = [...byId.values()]
    write(SAVED_KEY, saved)
    set({ saved })
    return arr.length
  },
  importSeeds: (seeds) => {
    const { data, saved, journey } = get()
    if (!data) return
    const done = read<string[]>(SEEDED_KEY, [])
    const have = new Set(saved.map((s) => s.id))
    const fresh = seeds
      .filter((t) => !have.has(t.id) && !done.includes(t.id))
      .map((t) => seedToJourney(data.inout, t))
      .filter((j): j is Journey => !!j)
    if (!fresh.length) return
    const next = [...saved, ...fresh]
    write(SAVED_KEY, next)
    write(SEEDED_KEY, [...done, ...fresh.map((j) => j.id)])
    if (journey) return set({ saved: next })
    write(CURRENT_KEY, fresh[0])
    set({ saved: next, journey: fresh[0] })
  },
  compare: [],
  toggleCompare: (id) => {
    const c = get().compare
    set({ compare: c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? [...c.slice(1), id] : [...c, id] })
  },

  mapOpen: true,
  showOnMap: () => set({ mapOpen: true, screen: 'map' }),
  applyMapTrips: (after, facts) => {
    const { data, journey, saved, mapOpen, compare } = get()
    if (!data) return
    const r = applyTrips(data.inout, data.map, journey, saved, mapOpen, after, facts)
    // a new trip needs a way in and a way home to start from
    if (!r) return set({ screen: 'trips', view: 'pick' })
    write(SAVED_KEY, r.saved)
    if (r.current) write(CURRENT_KEY, r.current)
    else write(CURRENT_KEY, null)
    set({ journey: r.current, saved: r.saved, mapOpen: r.open, compare: compare.filter((c) => r.saved.some((s) => s.id === c)) })
  },
}))
