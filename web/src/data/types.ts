// The data contract from docs/route-map/MAP_DESIGN_HANDOFF.md section 7, as written by
// src/build_web_data.py. Prices are integer DKK, durations minutes, coordinates lat/lon.

export type Tier = 'destination' | 'town' | 'stop_only'

export interface Hostel {
  name: string
  dorm_dkk: number | null
  private_dkk: number | null
  rating?: number | null
  price_suspect: boolean
  url?: string | null
}

export interface Place {
  id: string
  name: string
  short_name: string
  country: string
  lat: number
  lon: number
  tier: Tier
  type: string
  popularity: number
  iata: string | null
  airport_transfer_min: number | null
  context?: boolean // an airport that only appears as a flight via
  hub?: boolean // three or more flight routes: always shown and labelled first
  why?: string | null
  reason?: string | null
  summary?: string | null
  categories?: string[]
  things_to_do?: string[]
  touristy?: number | null
  altitude_m?: number | null
  image?: { url: string; page?: string; credit?: string; licence?: string; w?: number; h?: number } | null
  hostels?: Hostel[]
  hostel_note?: string | null
  experience_ids?: string[] | null
  saved_in?: string[] | null
}

export type StopType = 'stop' | 'change' | 'border' | 'layover'

export interface Stop {
  place_id: string
  type: StopType
  wait_min: number | null
}

export interface FlightQuote {
  dkk: number | null
  duration_min: number | null
  vias: string[]
  carriers: string[]
  date: string
  self_transfer?: boolean
}

/** The cheapest crawled one-way that departs on a date, in one direction. */
export interface DatedFare {
  date: string // departure date as flown, YYYY-MM-DD
  from: string
  to: string
  dkk: number | null
  dep: string | null // HH:MM local
  arr: string | null
  arr_days: number // the arrival is this many days after the departure
  duration_min: number | null
  vias: string[]
  carriers: string[]
  flights: string[]
  self_transfer: boolean
  searched: string // the date the search asked for
  link: string | null
}

/** One leg of a return ticket, as flown. */
export interface FlownLeg {
  date: string | null
  dep: string | null
  arr: string | null
  arr_days: number
  duration_min: number | null
  vias: string[]
  carriers: string[]
  flights: string[]
}

/** A crawled return ticket: out from `from` to `to`, home the other way. */
export interface RoundTrip {
  from: string
  to: string
  dkk: number | null
  out: FlownLeg
  home: FlownLeg
  self_transfer: boolean
  link: string | null
}

export interface FlightInfo {
  nonstop: boolean | null
  vias: string[]
  carriers: string[]
  oneway_dkk: { min: number | null; observed_at: string | null }
  return_dkk: { min: number | null; observed_at: string | null } | null
  dates_searched: string[]
  by_date?: DatedFare[]
  round_trips?: RoundTrip[]
  cheapest?: FlightQuote | null
  fastest?: FlightQuote | null
  flags?: string[]
  quotes?: number
}

export type Mode = 'bus' | 'shuttle' | 'chicken_bus' | 'colectivo' | 'train' | 'boat' | 'flight'

export interface RouteOption {
  mode: Mode
  operators: string[]
  duration_min: number | null
  duration_range_h?: string | null
  price_dkk: { min: number | null; typical: number | null }
  price_local?: string | null
  frequency: string | null
  overnight: boolean
  border: boolean
  stops: Stop[]
  geometry: [number, number][] | null
  flight: FlightInfo | null
  source: 'crawl' | 'manual'
  source_url?: string | null
  observed_at: string | null
  note: string | null
  booking_url: string | null
  researched?: { duration_min: number | null; price_min: number | null; operators: string[]; year: string | null }
}

export interface Connection {
  id: string
  a: string
  b: string
  options: RouteOption[]
}

export interface Country {
  code: string
  name: string
  label_lat: number
  label_lon: number
}

/**
 * A crawled regional one-way worth reading: per directed airport pair the cheapest, the fastest and the
 * cheapest that lands by day, one row when a quote is several of these. Times are local at each airport.
 */
export interface AirportFlight {
  from: string // IATA
  to: string
  dkk: number
  hours: number
  dep: string | null // YYYY-MM-DDTHH:MM at the origin
  arr: string | null // YYYY-MM-DDTHH:MM at the destination
  vias: string[]
  carriers: string[]
  shows: ('cheapest' | 'fastest' | 'daytime landing')[]
  notes: string[] // self transfer, US transit, basic fare, long layover
  link: string | null
}

/** One row of experiences.json. Training gyms and city scorecards fill `details`, see GymRow and CityRow. */
export interface Experience<D = Record<string, unknown>> {
  id: string
  name: string
  category: string
  tags: string[]
  area: string | null
  country: string
  lat: number | null
  lon: number | null
  summary: string | null
  price: string | null
  price_dkk: number | null
  duration?: string | null
  season?: string | null
  dec_jan?: string | null
  requirements?: string | null
  researched?: boolean
  checked_at?: string | null
  places?: string[]
  image?: Place['image']
  image_source?: string | null
  saved_in?: string[] | null
  sources?: string[]
  details?: D | null
}

/** Every value is out of 10. Any of them can be missing while a gym is still being researched. */
export interface ScoreCard {
  training: number | null
  evidence: number | null
  local_life: number | null
  cost: number | null
  water: number | null
  total: number | null
}

export interface OtherRating {
  site: string
  rating: number | null
  count: number | null
}

export interface Quote {
  quote: string
  site: string | null
  date: string | null
  url: string | null
}

export interface GymDetails {
  gym_kind?: string | null
  disciplines?: string[] | null
  coaches?: string | null
  fighters?: string | null
  sessions_per_week?: number | string | null
  timetable?: string | null
  sparring?: string | null
  visitors?: string | null
  price_dropin_dkk?: number | null
  price_week_dkk?: number | null
  price_month_dkk?: number | null
  private_dkk?: number | null
  google_rating?: number | null
  google_reviews?: number | null
  other_ratings?: OtherRating[] | null
  last_activity?: string | null
  what_people_say?: Quote[] | null
  neighbourhood?: string | null
  room_month_dkk?: number | null
  studio_month_dkk?: number | null
  food_day_dkk?: number | null
  water_km?: number | null
  water_note?: string | null
  score?: ScoreCard | null
  score_note?: string | null
  website?: string | null
  instagram?: string | null
  facebook?: string | null
  phone?: string | null
  google_maps_url?: string | null
  address?: string | null
  address_note?: string | null
  hours?: string | null
}

export interface Numbeo {
  numbeo_url?: string | null
  proxy_for?: string | null
  col_index?: number | null
  rent_index?: number | null
  col_plus_rent_index?: number | null
  single_month_no_rent_dkk?: number | null
  rent_1bed_outside_dkk?: number | null
  meal_cheap_dkk?: number | null
  gym_month_dkk?: number | null
  monthly_total_dkk?: number | null
  contributors_note?: string | null
  observed?: string | null
}

export interface CityHostels {
  dorm_night_dkk?: number | null
  private_night_dkk?: number | null
  n?: number | null
  names?: string[] | null
  source?: string | null
}

export interface CityIndices {
  backpacker_index_usd_day?: number | null
  backpacker_index_dkk_day?: number | null
  backpacker_index_year?: number | null
  backpacker_index_url?: string | null
  backpacker_index_note?: string | null
  expat_friendliness_rank?: number | null
  expat_settling_rank?: number | null
  expat_edition?: number | string | null
  expat_url?: string | null
  tasteatlas_cuisine_rank?: number | null
  tasteatlas_cuisine_score?: number | null
  tasteatlas_city_rank?: number | null
  tasteatlas_url?: string | null
  observed?: string | null
}

export interface CityDetails {
  gyms?: string[] | null
  best_gym?: string | null
  monthly_total_dkk?: number | null
  monthly_note?: string | null
  price_note?: string | null
  cost_note?: string | null
  room_month_dkk?: number | null
  studio_month_dkk?: number | null
  food_day_dkk?: number | null
  neighbourhoods?: string | null
  safety?: string | null
  local_life?: string | null
  water_note?: string | null
  also_seen?: string | null
  unverified?: string | null
  what_people_say?: Quote[] | null
  score?: ScoreCard | null
  numbeo?: Numbeo | null
  hostels?: CityHostels | null
  indices?: CityIndices | null
}

export type GymRow = Experience<GymDetails>
export type CityRow = Experience<CityDetails>

/** One row of experience_categories.json, for the name a category shows under. */
export interface ExperienceCategory {
  id: string
  name: string
}

/** One saved place or experience in lists.json. */
export interface SavedItem {
  type: 'place' | 'experience'
  id: string
  note?: string | null
  added?: string | null
}

export interface SavedList {
  id: string
  name: string
  items: SavedItem[]
}

export interface MapData {
  places: Place[]
  connections: Connection[]
  countries: Country[]
  flights?: AirportFlight[]
  experiences?: Experience[]
  categories?: ExperienceCategory[]
  lists?: SavedList[]
}

/** The three route families the map draws and the toggles switch. */
export type Family = 'ground' | 'boat' | 'flight'

export function familyOf(mode: Mode): Family {
  return mode === 'flight' ? 'flight' : mode === 'boat' ? 'boat' : 'ground'
}
