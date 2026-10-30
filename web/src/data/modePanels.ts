// What the two mode panels work out from the filters and the rows: their counts, their notes and how a row of chips
// folds. Pure, so the components hold only markup.
import { filterCities, type GymFilter, type GymWorld } from './gyms'
import { groupByPlace, type ExperienceFilter, type ExperienceWorld, type PlaceGroup, type SavedEntry } from './experiences'
import type { CityRow, Experience, Place } from './types'

/** "12 of 90 gyms", or "24 of 313" with no noun. */
export const countText = (shown: number, total: number, noun?: string) => `${shown} of ${total}${noun ? ` ${noun}` : ''}`

/** "3 gyms hidden: no cost data", or nothing when none are. */
export function hiddenNote(hidden: number, one: string, many: string): string | null {
  return hidden > 0 ? `${hidden} ${hidden === 1 ? one : many} hidden: no cost data` : null
}

/** Every country in the rows with its count, biggest first. */
export function countryCounts(rows: { country: string }[]): [string, number][] {
  const n = new Map<string, number>()
  for (const r of rows) n.set(r.country, (n.get(r.country) ?? 0) + 1)
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export const toggled = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

export interface ChipFold {
  shown: string[]
  /** How many the More chip stands for. */
  hidden: number
}

/** The chips of a long row: the first `cap`, plus any picked one further along, so a pick is never out of sight. */
export function foldChips(ids: string[], picked: string[], cap: number, open: boolean): ChipFold {
  if (open || ids.length <= cap + 1) return { shown: ids, hidden: 0 }
  const shown = ids.filter((id, i) => i < cap || picked.includes(id))
  return { shown, hidden: ids.length - shown.length }
}

const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/** A month of living in a city, or null when it has no cost data. */
export function cityMonthDkk(c: CityRow): number | null {
  const total = c.details?.numbeo?.monthly_total_dkk
  return finite(total) ? total : null
}

/** Cities the cost filter dropped only because they have no cost data. */
export function hiddenCitiesByCost(w: GymWorld, f: GymFilter): number {
  if (f.maxCost == null) return 0
  return filterCities(w, { ...f, maxCost: null }).filter((c) => cityMonthDkk(c) == null).length
}

export const experienceFiltersActive = (f: ExperienceFilter) => f.countries.length + f.categories.length + (f.saved ? 1 : 0)

/** Picks of categories the new countries do not have go, or they would filter with no chip to switch them off. */
export function keepCategories(categories: string[], available: [string, number][]) {
  const there = new Set(available.map(([id]) => id))
  return categories.filter((c) => there.has(c))
}

/** The groups under the Saved group. A saved row stands only there, and the Saved chip leaves nothing else. */
export function placeGroups(w: ExperienceWorld, rows: Experience[], saved: SavedEntry[], places: Pick<Place, 'id' | 'name'>[], f: ExperienceFilter): PlaceGroup[] {
  if (f.saved) return []
  const up = new Set(saved.filter((s) => s.type === 'experience').map((s) => s.id))
  return groupByPlace(w, rows.filter((e) => !up.has(e.id)), places)
}
