// The training gyms and city scorecards from experiences.json: who belongs to what, what a month costs,
// the filters and the ranking. No map and no React here, so the list, the cards and the map agree.
import { km } from '../lib/geo'
import type { CityRow, Experience, GymRow, Place, ScoreCard } from './types'

export const DISCIPLINES = ['Muay Thai', 'Kickboxing', 'Boxing', 'MMA', 'BJJ'] as const
export type Discipline = (typeof DISCIPLINES)[number]

const TAGS: Record<string, Discipline> = {
  'muay-thai': 'Muay Thai',
  kickboxing: 'Kickboxing',
  boxing: 'Boxing',
  mma: 'MMA',
  bjj: 'BJJ',
}
const PARSE: [Discipline, RegExp][] = [
  ['Muay Thai', /muay\s*thai/],
  ['Kickboxing', /kick\s*boxing/],
  ['MMA', /\bmma\b/],
  ['BJJ', /\bbjj\b|jiu.?jitsu/],
]
const BOXING = /\bboxing\b/
const FITNESS_BOXING = /fitness|cardio|area/

const isGym = (r: Experience) => r.category === 'training' && r.tags?.includes('gym') && r.lat != null && r.lon != null
const isCity = (r: Experience) => !!r.tags?.includes('city-scorecard')
const finite = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n)

/**
 * The disciplines a gym teaches. Tags and the parsed details each miss some, so it is the two together.
 * A gym whose only boxing is a fitness class does not count as boxing.
 */
export function disciplinesOf(g: GymRow): Discipline[] {
  const raw = (g.details?.disciplines ?? []).map((d) => d.toLowerCase())
  const found = new Set<Discipline>()
  for (const tag of g.tags) if (TAGS[tag]) found.add(TAGS[tag])
  for (const value of raw) {
    for (const [name, re] of PARSE) if (re.test(value)) found.add(name)
    if (BOXING.test(value) && !FITNESS_BOXING.test(value)) found.add('Boxing')
  }
  const boxingOnlyFitness = raw.some((d) => BOXING.test(d)) && !raw.some((d) => BOXING.test(d) && !FITNESS_BOXING.test(d))
  if (boxingOnlyFitness) found.delete('Boxing')
  return DISCIPLINES.filter((d) => found.has(d))
}

/** What else a gym lists, beyond the five the filters know: wrestling, judo, a fitness class. */
export function otherDisciplines(g: GymRow): string[] {
  const seen = new Set<string>()
  return (g.details?.disciplines ?? []).flatMap((d) => {
    const value = d.trim()
    const low = value.toLowerCase()
    if (!low || seen.has(low)) return []
    seen.add(low)
    const known = PARSE.some(([, re]) => re.test(low)) || (BOXING.test(low) && !FITNESS_BOXING.test(low))
    return known ? [] : [value]
  })
}

export const scoreOf = (r: Experience<{ score?: ScoreCard | null }>): ScoreCard | null => r.details?.score ?? null
export const totalOf = (r: Experience<{ score?: ScoreCard | null }>): number | null => {
  const t = scoreOf(r)?.total
  return finite(t) ? t : null
}

/** What the gym charges for a month. */
export const gymMonthDkk = (g: GymRow): number | null => g.details?.price_month_dkk ?? g.price_dkk ?? null

/** The name of a scorecard without its "training base scorecard" suffix. */
export const cityName = (c: CityRow): string => c.area || c.name.replace(/:.*$/, '')

export interface MonthlyCost {
  living: number // the city's Numbeo total, rent included
  gym: number | null // the gym's month, when it is known
  total: number
}

/** A month in the gym's city, the gym included when its price is known. Null without a Numbeo total. */
export function monthlyCost(g: GymRow, city: CityRow | null | undefined): MonthlyCost | null {
  const living = city?.details?.numbeo?.monthly_total_dkk
  if (!finite(living)) return null
  const gym = gymMonthDkk(g)
  return { living, gym, total: living + (gym ?? 0) }
}

export interface GymWorld {
  gyms: GymRow[]
  cities: CityRow[]
  byId: Map<string, GymRow | CityRow>
  cityOf: Map<string, CityRow> // by gym id
  gymsOf: (city: CityRow) => GymRow[]
  cityOfPlace: (placeId: string) => CityRow | null
  gymsAtPlace: (placeId: string) => GymRow[]
}

/** A scorecard can come without a place id, so the closest place within this distance stands in for it. */
const NEAR_PLACE_KM = 25

function placeOfCity(c: CityRow, places: Pick<Place, 'id' | 'lat' | 'lon'>[]): string | null {
  if (c.places?.length) return c.places[0]
  if (c.lat == null || c.lon == null) return null
  let best: string | null = null
  let bestKm = NEAR_PLACE_KM
  for (const p of places) {
    const d = km(c.lat, c.lon, p.lat, p.lon)
    if (d <= bestKm) {
      best = p.id
      bestKm = d
    }
  }
  return best
}

/**
 * Sorts the rows and ties them together. A gym belongs to the card that lists it, or else to the card of
 * its place, because the cards do not list every gym in their city and a city must not lose those.
 */
export function gymWorld(rows: Experience[] | undefined, places: Pick<Place, 'id' | 'lat' | 'lon'>[]): GymWorld {
  const gyms = (rows ?? []).filter(isGym) as GymRow[]
  const cities = (rows ?? []).filter(isCity) as CityRow[]
  const byId = new Map<string, GymRow | CityRow>()
  for (const r of [...gyms, ...cities]) byId.set(r.id, r)

  const cardAtPlace = new Map<string, CityRow>()
  const placeOfCard = new Map<string, string>()
  for (const c of cities) {
    const place = placeOfCity(c, places)
    if (!place) continue
    placeOfCard.set(c.id, place)
    if (!cardAtPlace.has(place)) cardAtPlace.set(place, c)
  }

  const cityOf = new Map<string, CityRow>()
  for (const c of cities) {
    for (const id of c.details?.gyms ?? []) if (byId.has(id) && !cityOf.has(id)) cityOf.set(id, c)
  }
  const atPlace = new Map<string, GymRow[]>()
  for (const g of gyms) {
    for (const p of g.places ?? []) {
      atPlace.set(p, [...(atPlace.get(p) ?? []), g])
      const c = cardAtPlace.get(p)
      if (c && !cityOf.has(g.id)) cityOf.set(g.id, c)
    }
  }

  const ofCity = new Map<string, GymRow[]>()
  for (const g of gyms) {
    const c = cityOf.get(g.id)
    if (c) ofCity.set(c.id, [...(ofCity.get(c.id) ?? []), g])
  }

  return {
    gyms,
    cities,
    byId,
    cityOf,
    gymsOf: (city) => rankGyms(ofCity.get(city.id) ?? []),
    cityOfPlace: (id) => cardAtPlace.get(id) ?? null,
    gymsAtPlace: (id) => rankGyms(atPlace.get(id) ?? []),
  }
}

export interface GymFilter {
  disciplines: Discipline[] // any of them
  countries: string[] // any of them
  minScore: number // 0 is any
  maxCost: number | null // null is any
  nearWater: boolean
}

export const NO_FILTER: GymFilter = { disciplines: [], countries: [], minScore: 0, maxCost: null, nearWater: false }

export const NEAR_WATER_KM = 5

/** How many filters are switched on, for the count on the Filters button. */
export const filtersActive = (f: GymFilter) =>
  f.disciplines.length + f.countries.length + (f.minScore > 0 ? 1 : 0) + (f.maxCost != null ? 1 : 0) + (f.nearWater ? 1 : 0)

const teaches = (g: GymRow, f: GymFilter) => !f.disciplines.length || disciplinesOf(g).some((d) => f.disciplines.includes(d))
const nearWater = (g: GymRow, f: GymFilter) => !f.nearWater || (finite(g.details?.water_km) && g.details!.water_km! < NEAR_WATER_KM)
const inCountry = (r: { country: string }, f: GymFilter) => !f.countries.length || f.countries.includes(r.country)
const hasScore = (r: Experience<{ score?: ScoreCard | null }>, f: GymFilter) => f.minScore <= 0 || (totalOf(r) ?? -1) >= f.minScore

const beforeCost = (g: GymRow, f: GymFilter) => teaches(g, f) && nearWater(g, f) && inCountry(g, f) && hasScore(g, f)

export function filterGyms(w: GymWorld, f: GymFilter): GymRow[] {
  return w.gyms.filter((g) => {
    if (!beforeCost(g, f)) return false
    if (f.maxCost == null) return true
    const cost = monthlyCost(g, w.cityOf.get(g.id))
    return cost != null && cost.total <= f.maxCost
  })
}

/** Gyms the cost filter dropped only because their city has no cost data, so the list can say so. */
export function hiddenByCost(w: GymWorld, f: GymFilter): number {
  if (f.maxCost == null) return 0
  return w.gyms.filter((g) => beforeCost(g, f) && !monthlyCost(g, w.cityOf.get(g.id))).length
}

/** The same filters on the cities. Discipline and water ask whether some gym in the city matches. */
export function filterCities(w: GymWorld, f: GymFilter): CityRow[] {
  return w.cities.filter((c) => {
    if (!inCountry(c, f) || !hasScore(c, f)) return false
    if (f.maxCost != null) {
      const living = c.details?.numbeo?.monthly_total_dkk
      if (!finite(living) || living > f.maxCost) return false
    }
    if (!f.disciplines.length && !f.nearWater) return true
    return w.gymsOf(c).some((g) => teaches(g, f) && nearWater(g, f))
  })
}

function byScore<R extends Experience<{ score?: ScoreCard | null }>>(a: R, b: R) {
  const ta = totalOf(a)
  const tb = totalOf(b)
  if (ta == null || tb == null) {
    if (ta != null) return -1
    if (tb != null) return 1
  } else if (ta !== tb) return tb - ta
  return a.name.localeCompare(b.name)
}

export const rankGyms = (gyms: GymRow[]) => [...gyms].sort(byScore)
export const rankCities = (cities: CityRow[]) => [...cities].sort(byScore)

/** The cheapest and dearest month over all gyms, rounded out to `step`, for the cost slider. */
export function costRange(w: GymWorld, step = 250): [number, number] | null {
  const costs = w.gyms.flatMap((g) => monthlyCost(g, w.cityOf.get(g.id))?.total ?? [])
  if (!costs.length) return null
  return [Math.floor(Math.min(...costs) / step) * step, Math.ceil(Math.max(...costs) / step) * step]
}

/** The top of the score slider: the best total, rounded up. */
export function topScore(w: GymWorld): number {
  return Math.ceil(Math.max(0, ...w.gyms.map((g) => totalOf(g) ?? 0)))
}

export const TOP_SCORE = 6
export const MID_SCORE = 4.5
export type ScoreTier = 'top' | 'mid' | 'low' | 'none'

export function scoreTier(total: number | null): ScoreTier {
  if (total == null) return 'none'
  return total >= TOP_SCORE ? 'top' : total >= MID_SCORE ? 'mid' : 'low'
}

/** The gym's own Google link, or a maps search on its name and coordinates. */
export function mapsUrl(g: GymRow): string {
  if (g.details?.google_maps_url) return g.details.google_maps_url
  const q = `${g.name} ${g.lat},${g.lon}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}

export interface GymLink {
  kind: 'website' | 'instagram' | 'facebook' | 'maps' | 'call'
  label: string
  href: string
}

/** The link buttons of a gym card, the ones it has, in the order they show. */
export function gymLinks(g: GymRow): GymLink[] {
  const d = g.details ?? {}
  const links: GymLink[] = []
  if (d.website) links.push({ kind: 'website', label: 'Website', href: d.website })
  if (d.instagram) links.push({ kind: 'instagram', label: 'Instagram', href: d.instagram })
  if (d.facebook) links.push({ kind: 'facebook', label: 'Facebook', href: d.facebook })
  links.push({ kind: 'maps', label: 'Google Maps', href: mapsUrl(g) })
  if (d.phone) links.push({ kind: 'call', label: 'Call', href: `tel:${d.phone.replace(/[^\d+]/g, '')}` })
  return links
}

const SPREAD = 0.008

/**
 * Where each marker sits on the map. Rows that share a spot move apart on a small circle, wider for a big
 * group, or only the top one could be tapped. The links keep the real coordinates.
 */
export function spreadGyms(rows: { id: string; lat: number | null; lon: number | null }[]): Map<string, [number, number]> {
  const groups = new Map<string, typeof rows>()
  for (const r of rows) {
    if (r.lat == null || r.lon == null) continue
    const key = `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const at = new Map<string, [number, number]>()
  for (const group of groups.values()) {
    const reach = SPREAD * Math.max(1, group.length / 8)
    group.forEach((r, i) => {
      if (group.length === 1) return at.set(r.id, [r.lon!, r.lat!])
      const angle = (i / group.length) * 2 * Math.PI
      at.set(r.id, [r.lon! + reach * Math.cos(angle), r.lat! + reach * Math.sin(angle)])
    })
  }
  return at
}
