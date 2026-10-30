// The experiences on the place cards and in the Experiences view, and what lists.json has saved. Gyms and
// city scorecards are experiences too, but they have their own rules in gyms.ts and stay out of here.
import { km } from '../lib/geo'
import type { Experience, ExperienceCategory, Place, SavedList } from './types'

/** An experience with no map place goes under the closest place within this distance. */
export const NEAR_PLACE_KM = 30

/** Why something is saved: the list it is on and the note there. */
export interface SavedMark {
  list: string
  note: string | null
}

/** A saved place or experience that exists, in the order of its list. */
export interface SavedEntry {
  type: 'place' | 'experience'
  id: string
  name: string
  country: string
  category: string | null
  mark: SavedMark
}

export interface ExperienceWorld {
  all: Experience[]
  byId: Map<string, Experience>
  saved: SavedEntry[]
  savedPlaces: Set<string> // saved themselves, or holding a saved experience
  markOf: (type: 'place' | 'experience', id: string) => SavedMark | null
  at: (placeId: string) => Experience[] // saved first
  placeOf: (experienceId: string) => string | null
}

type PlaceRow = Pick<Place, 'id' | 'name' | 'country' | 'lat' | 'lon'> & Partial<Pick<Place, 'experience_ids' | 'saved_in'>>

const isTraining = (r: Experience) => !!r.tags?.includes('gym') || !!r.tags?.includes('city-scorecard')

function nearestPlace(e: Experience, places: PlaceRow[]): string | null {
  if (e.lat == null || e.lon == null) return null
  let best: string | null = null
  let bestKm = NEAR_PLACE_KM
  for (const p of places) {
    const d = km(e.lat, e.lon, p.lat, p.lon)
    if (d <= bestKm) {
      best = p.id
      bestKm = d
    }
  }
  return best
}

/** Ties experiences to places and saved marks. Lists and rows each say what is saved, so both count. */
export function experienceWorld(rows: Experience[] | undefined, places: PlaceRow[], lists: SavedList[] | undefined): ExperienceWorld {
  const all = (rows ?? []).filter((r) => !isTraining(r))
  const byId = new Map(all.map((e) => [e.id, e]))
  const placeById = new Map(places.map((p) => [p.id, p]))

  const marks = new Map<string, SavedMark>()
  const saved: SavedEntry[] = []
  for (const list of lists ?? []) {
    for (const item of list.items) {
      const key = `${item.type}:${item.id}`
      const row = item.type === 'experience' ? byId.get(item.id) : placeById.get(item.id)
      if (marks.has(key) || !row) continue
      const mark = { list: list.name, note: item.note || null }
      marks.set(key, mark)
      const category = item.type === 'experience' ? (row as Experience).category : null
      saved.push({ type: item.type, id: item.id, name: row.name, country: row.country, category, mark })
    }
  }
  const listName = (ids: string[]) => lists?.find((l) => ids.includes(l.id))?.name ?? 'Saved'
  const unlisted = (type: SavedEntry['type'], r: PlaceRow | Experience, category: string | null) => {
    const key = `${type}:${r.id}`
    if (!r.saved_in?.length || marks.has(key)) return
    const mark = { list: listName(r.saved_in), note: null }
    marks.set(key, mark)
    saved.push({ type, id: r.id, name: r.name, country: r.country, category, mark })
  }
  for (const p of places) unlisted('place', p, null)
  for (const e of all) unlisted('experience', e, e.category)

  const atPlace = new Map<string, Experience[]>()
  const home = new Map<string, string>()
  const put = (placeId: string, e: Experience) => {
    const list = atPlace.get(placeId) ?? []
    if (list.includes(e)) return
    atPlace.set(placeId, [...list, e])
    if (!home.has(e.id)) home.set(e.id, placeId)
  }
  for (const p of places) {
    for (const id of p.experience_ids ?? []) {
      const e = byId.get(id)
      if (e) put(p.id, e)
    }
  }
  for (const e of all) {
    for (const id of e.places ?? []) if (placeById.has(id)) put(id, e)
    if (!e.places?.length && !home.has(e.id)) {
      const near = nearestPlace(e, places)
      if (near) put(near, e)
    }
  }

  const isSaved = (e: Experience) => marks.has(`experience:${e.id}`)
  for (const [id, list] of atPlace) {
    atPlace.set(id, [...list].sort((a, b) => Number(isSaved(b)) - Number(isSaved(a)) || a.name.localeCompare(b.name)))
  }
  const savedPlaces = new Set(saved.filter((s) => s.type === 'place').map((s) => s.id))
  for (const [id, list] of atPlace) if (list.some(isSaved)) savedPlaces.add(id)

  return {
    all,
    byId,
    saved,
    savedPlaces,
    markOf: (type, id) => marks.get(`${type}:${id}`) ?? null,
    at: (id) => atPlace.get(id) ?? [],
    placeOf: (id) => home.get(id) ?? null,
  }
}

export interface ExperienceFilter {
  countries: string[] // any of them
  categories: string[] // any of them
  saved: boolean
}

export const NO_EXPERIENCE_FILTER: ExperienceFilter = { countries: [], categories: [], saved: false }

export function filterExperiences(w: ExperienceWorld, f: ExperienceFilter): Experience[] {
  return w.all.filter(
    (e) =>
      (!f.countries.length || f.countries.includes(e.country)) &&
      (!f.categories.length || f.categories.includes(e.category)) &&
      (!f.saved || w.markOf('experience', e.id) != null),
  )
}

/** The saved group of the view. A place has no category, so a category filter leaves only experiences. */
export function filterSaved(w: ExperienceWorld, f: ExperienceFilter): SavedEntry[] {
  return w.saved.filter(
    (s) =>
      (!f.countries.length || f.countries.includes(s.country)) &&
      (!f.categories.length || (s.category != null && f.categories.includes(s.category))),
  )
}

const counts = (keys: string[]): [string, number][] => {
  const n = new Map<string, number>()
  for (const k of keys) n.set(k, (n.get(k) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

/** Every country with its count, biggest first. */
export const countriesOf = (w: ExperienceWorld) => counts(w.all.map((e) => e.country))

/** Every category with its count in the picked countries, biggest first. */
export const categoriesIn = (w: ExperienceWorld, countries: string[]) =>
  counts(w.all.filter((e) => !countries.length || countries.includes(e.country)).map((e) => e.category))

export interface PlaceGroup {
  id: string
  name: string
  rows: Experience[]
}

/** Rows under their place, by name. One with no place near it stands under its own area. */
export function groupByPlace(w: ExperienceWorld, rows: Experience[], places: Pick<Place, 'id' | 'name'>[]): PlaceGroup[] {
  const names = new Map(places.map((p) => [p.id, p.name]))
  const groups = new Map<string, PlaceGroup>()
  for (const e of rows) {
    const place = w.placeOf(e.id)
    const id = place ?? `area:${e.area ?? e.country}`
    const group = groups.get(id) ?? { id, name: (place && names.get(place)) || e.area || e.name, rows: [] }
    group.rows.push(e)
    groups.set(id, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** The name a category shows under, from experience_categories.json when it is there. */
export function categoryLabel(categories: ExperienceCategory[] | undefined, id: string): string {
  return categories?.find((c) => c.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1).replace(/[-_]/g, ' ')
}

export interface DetailLine {
  key: string
  label: string
  value: string
  href: string | null
}

const isUrl = (s: string) => /^https?:\/\//.test(s)

const say = (v: unknown): string | null => {
  if (v == null || v === '') return null
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v === 'string') return v.trim() || null
  if (Array.isArray(v)) return v.map(say).filter(Boolean).join(', ') || null
  return null
}

/** The `details` of an experience as lines to show. Whatever has no value is left out. */
export function detailLines(details: Record<string, unknown> | null | undefined): DetailLine[] {
  return Object.entries(details ?? {}).flatMap(([key, raw]) => {
    const value = say(raw)
    if (!value) return []
    const label = (key.charAt(0).toUpperCase() + key.slice(1)).replace(/_/g, ' ')
    return [{ key, label, value, href: isUrl(value) ? value : null }]
  })
}

/** The domain of a source, as the text of its link. */
export function sourceLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
