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

export interface FlightInfo {
  nonstop: boolean | null
  vias: string[]
  carriers: string[]
  oneway_dkk: { min: number | null; observed_at: string | null }
  return_dkk: { min: number | null; observed_at: string | null } | null
  dates_searched: string[]
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

export interface MapData {
  places: Place[]
  connections: Connection[]
  countries: Country[]
}

/** The three route families the map draws and the toggles switch. */
export type Family = 'ground' | 'boat' | 'flight'

export function familyOf(mode: Mode): Family {
  return mode === 'flight' ? 'flight' : mode === 'boat' ? 'boat' : 'ground'
}
