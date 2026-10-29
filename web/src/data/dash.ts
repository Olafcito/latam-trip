/**
 * The flight option tables: whole trips, long-haul tickets and regional one-ways, as written by
 * src/dashboard_data.py into data/web/dash_*.json. Prices, ratings and times come ready made and
 * are never recomputed here. Everything below is a pure function over those rows.
 */

export interface DashTrip {
  id: string
  scenario: string
  route: string
  in: string
  out: string
  type: string
  rating: number
  rating_cost: number
  rating_hours: number
  total_kr: number
  travel_hours: number
  long_haul_kr: number
  regional_kr: number
  hub_nights: number
  night_arrivals: number
  out_leaves: string
  out_lands: string
  out_hours: number
  out_via: string
  out_airlines: string
  home_leaves: string
  home_lands: string
  home_hours: number
  home_via: string
  home_airlines: string
  regional_flights: string
  stops: string
}

export interface DashJourney {
  id: string
  in: string
  out: string
  type: string
  rating: number
  rating_flights: number
  total_kr: number
  flights_kr: number
  cabin_bags_kr: number
  hub_stays_kr: number
  hub_nights: number
  out_leaves: string
  out_lands: string
  out_hours: number
  out_via: string
  out_airlines: string
  home_leaves: string
  home_lands: string
  home_hours: number
  home_via: string
  home_airlines: string
  stops: string
}

export interface DashFlight {
  id: string
  from: string
  to: string
  from_code: string
  to_code: string
  pick: string
  price_kr: number
  hours: number
  departs: string
  lands: string
  via: string
  airlines: string
  notes: string
  dates_searched: number
}

export type DashRow = DashTrip | DashJourney | DashFlight

/** How a column is shown: a coloured rating, a one decimal number, kr, an integer, wrapped text or plain text. */
export type CellKind = 'rate' | 'n1' | 'kr' | 'int' | 'wrap' | 'text'

const KINDS: Record<string, CellKind> = {
  rating: 'rate',
  rating_cost: 'n1',
  rating_hours: 'n1',
  rating_flights: 'n1',
  travel_hours: 'n1',
  out_hours: 'n1',
  home_hours: 'n1',
  hours: 'n1',
  total_kr: 'kr',
  long_haul_kr: 'kr',
  regional_kr: 'kr',
  flights_kr: 'kr',
  cabin_bags_kr: 'kr',
  hub_stays_kr: 'kr',
  price_kr: 'kr',
  hub_nights: 'int',
  dates_searched: 'int',
  regional_flights: 'wrap',
  stops: 'wrap',
}

export function cellKind(key: string): CellKind {
  return KINDS[key] ?? 'text'
}

export interface Column {
  key: string
  label: string
  /** the first column of a group gets a left rule */
  group?: boolean
}

export const TRIP_COLUMNS: Column[] = [
  { key: 'rating', label: 'Rating' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'route', label: 'Regions in order' },
  { key: 'in', label: 'In' },
  { key: 'out', label: 'Home from' },
  { key: 'type', label: 'Long-haul type' },
  { key: 'total_kr', label: 'Total (kr)' },
  { key: 'travel_hours', label: 'Travel h' },
  { key: 'rating_cost', label: 'Cost score' },
  { key: 'rating_hours', label: 'Hours score' },
  { key: 'long_haul_kr', label: 'Long-haul (kr)' },
  { key: 'regional_kr', label: 'Regional (kr)' },
  { key: 'hub_nights', label: 'Hub nights' },
  { key: 'out_leaves', label: 'Out leaves CPH', group: true },
  { key: 'out_lands', label: 'Out lands' },
  { key: 'out_hours', label: 'Out h' },
  { key: 'out_via', label: 'Out via' },
  { key: 'out_airlines', label: 'Out airlines' },
  { key: 'home_leaves', label: 'Home leaves', group: true },
  { key: 'home_lands', label: 'Home lands CPH' },
  { key: 'home_hours', label: 'Home h' },
  { key: 'home_via', label: 'Home via' },
  { key: 'home_airlines', label: 'Home airlines' },
  { key: 'regional_flights', label: 'Regional flights', group: true },
  { key: 'stops', label: 'Stops at hubs' },
]

export const JOURNEY_COLUMNS: Column[] = [
  { key: 'rating', label: 'Rating' },
  { key: 'in', label: 'In' },
  { key: 'out', label: 'Home from' },
  { key: 'type', label: 'Type' },
  { key: 'total_kr', label: 'Total (kr)' },
  { key: 'flights_kr', label: 'Flights (kr)' },
  { key: 'cabin_bags_kr', label: 'Cabin bags (kr)' },
  { key: 'hub_stays_kr', label: 'Hub stays (kr)' },
  { key: 'rating_flights', label: 'Rating on flights' },
  { key: 'hub_nights', label: 'Hub nights' },
  { key: 'out_leaves', label: 'Out leaves CPH', group: true },
  { key: 'out_lands', label: 'Out lands' },
  { key: 'out_hours', label: 'Out h' },
  { key: 'out_via', label: 'Out via' },
  { key: 'out_airlines', label: 'Out airlines' },
  { key: 'home_leaves', label: 'Home leaves', group: true },
  { key: 'home_lands', label: 'Home lands CPH' },
  { key: 'home_hours', label: 'Home h' },
  { key: 'home_via', label: 'Home via' },
  { key: 'home_airlines', label: 'Home airlines' },
  { key: 'stops', label: 'Stops at hubs', group: true },
]

export const FLIGHT_COLUMNS: Column[] = [
  { key: 'from', label: 'From' },
  { key: 'to', label: 'To' },
  { key: 'price_kr', label: 'Price (kr)' },
  { key: 'hours', label: 'Hours' },
  { key: 'departs', label: 'Departs' },
  { key: 'lands', label: 'Lands' },
  { key: 'via', label: 'Via' },
  { key: 'airlines', label: 'Airlines' },
  { key: 'pick', label: 'Row shows' },
  { key: 'notes', label: 'Notes' },
  { key: 'dates_searched', label: 'Dates searched' },
]

// ---- filters

export type Scenario = 'all' | 'A' | 'B'

export interface TripFilter {
  scenario: Scenario
  /** arrival city, '' for any */
  in: string
  /** home city, '' for any */
  out: string
  /** free text over every field */
  q: string
}

export type Direction = 'in' | 'out'

export interface FlightFilter {
  /** airport code, '' for any */
  airport: string
  /** 'in' keeps flights landing at the airport, 'out' keeps flights leaving it */
  dir: Direction
  q: string
}

function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Case and accent insensitive search over every value of the row. Every word must match somewhere. */
export function matchesText<T extends object>(row: T, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  const hay = fold(Object.values(row).map((v) => String(v ?? '')).join(' '))
  return words.every((w) => hay.includes(w))
}

export function filterTrips(rows: DashTrip[], f: TripFilter): DashTrip[] {
  return rows.filter(
    (r) =>
      (f.scenario === 'all' || r.scenario.startsWith(f.scenario)) &&
      (!f.in || r.in === f.in) &&
      (!f.out || r.out === f.out) &&
      matchesText(r, f.q),
  )
}

export function filterJourneys(rows: DashJourney[], q: string): DashJourney[] {
  return rows.filter((r) => matchesText(r, q))
}

export function filterFlights(rows: DashFlight[], f: FlightFilter): DashFlight[] {
  return rows.filter((r) => (!f.airport || (f.dir === 'in' ? r.to_code : r.from_code) === f.airport) && matchesText(r, f.q))
}

// ---- options for the dropdowns

/** Distinct values of a city column, alphabetically. */
export function cityOptions(rows: DashTrip[], field: 'in' | 'out'): string[] {
  return [...new Set(rows.map((r) => r[field]).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

export interface AirportOption {
  code: string
  /** "Santa Cruz (VVI)", or just the code when the data has no better name */
  label: string
}

/** Every airport that appears as an origin or a destination, labelled "City (CODE)", alphabetically by label. */
export function airportOptions(rows: DashFlight[]): AirportOption[] {
  const names = new Map<string, string>()
  for (const r of rows) {
    if (!names.has(r.from_code) || names.get(r.from_code) === r.from_code) names.set(r.from_code, r.from)
    if (!names.has(r.to_code) || names.get(r.to_code) === r.to_code) names.set(r.to_code, r.to)
  }
  return [...names]
    .map(([code, name]) => ({ code, label: name && name !== code ? `${name} (${code})` : code }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

// ---- sort

export type SortDir = 'asc' | 'desc'

export interface Sort {
  key: string
  dir: SortDir
}

/** The direction a column starts in when first clicked: ratings high first, costs and hours low first, text A to Z. */
export function defaultDir(key: string): SortDir {
  if (key.startsWith('rating')) return 'desc'
  if (key.endsWith('_kr') || key.endsWith('hours') || key === 'hours') return 'asc'
  if (cellKind(key) === 'text' || cellKind(key) === 'wrap') return 'asc'
  return 'desc'
}

/** Clicking a header: a new column starts in its default direction, the same column flips. */
export function nextSort(current: Sort | null, key: string): Sort {
  if (current && current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: defaultDir(key) }
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v)
  return null
}

function num(row: object, key: string): number {
  return asNumber((row as Record<string, unknown>)[key]) ?? 0
}

/**
 * Sort rows by one column: numerically when both values are numbers, alphabetically otherwise.
 * Ties fall back to the best rating, then the lowest total, so equal cells keep a sensible order.
 */
export function sortRows<T extends object>(rows: T[], sort: Sort): T[] {
  const sign = sort.dir === 'asc' ? 1 : -1
  const get = (r: T) => (r as Record<string, unknown>)[sort.key]
  return [...rows].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    const na = asNumber(va)
    const nb = asNumber(vb)
    let c: number
    if (na != null && nb != null) c = na - nb
    else c = String(va ?? '').localeCompare(String(vb ?? ''), undefined, { sensitivity: 'base' })
    if (c !== 0) return c * sign
    return num(b, 'rating') - num(a, 'rating') || num(a, 'total_kr') - num(b, 'total_kr') || num(a, 'price_kr') - num(b, 'price_kr')
  })
}

/** The arrival and home airports of a whole trip or long-haul ticket, read from its id ("SJO-LPB-ticket|CA-CO-BO"). */
export function airportsOf(id: string): string[] {
  const m = /^([A-Z]{3})-([A-Z]{3})(?:-|$)/.exec(id)
  return m ? [...new Set([m[1], m[2]])] : []
}

/** 8 or more is good, 5 to 7.9 is fair, below 5 is poor. */
export function ratingBand(r: number): 'good' | 'fair' | 'poor' {
  return r >= 8 ? 'good' : r >= 5 ? 'fair' : 'poor'
}
