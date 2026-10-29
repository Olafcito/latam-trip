// Types for data/inout.json (references/inout-schema.md) and data/network/map.json (references/map-schema.md).
// Times are local at the airport, "YYYY-MM-DDTHH:MM". Prices are DKK.

export type WayType = 'ticket' | 'madrid' | 'oneways'
export type Direction = 'in' | 'home'

export interface Airport {
  name: string
  country: string
  lat: number
  lon: number
  region: string | null
  utc_offset: number
  home: boolean
  map_node?: string
}

export interface Ticket {
  id: string
  quote_id: string
  source: string
  observed_at: string
  structure: 'one_way' | 'return' | 'open_jaw' | 'multi_city' | string
  legs: string[]
  price_dkk: number
  fare_brand: string | null
  cabin_bag: string | null
  checked_bag: string | null
  cabin_bag_fee_dkk: number | null
  checked_bag_fee_dkk: number | null
  tickets_inside: number
  self_transfer: boolean
  carriers: string[]
  flags: string[]
  notes: string | null
  link: string | null
}

export interface Connection {
  airport: string
  layover_h: number | null
}

export interface FlightItem {
  kind: 'flight'
  from: string
  to: string
  depart: string
  arrive: string
  hours: number
  connections: Connection[]
  carriers: string[]
  flight_numbers?: string[]
  overnight_layover: boolean
  self_transfer_inside: boolean
  ticket: string
}

export type StopKind = 'night' | 'day_stop' | 'self_transfer' | 'connection'

export interface StopItem {
  kind: StopKind
  airport: string
  arrive: string
  depart: string
  hours: number
  nights: number
  same_ticket: boolean
  stay_estimate_dkk: number | null
}

export type TimelineItem = FlightItem | StopItem

export interface Extras {
  cabin_bag_fees_dkk: number | null
  checked_bag_fees_dkk: number | null
  hub_nights: number
  hub_stay_estimate_dkk: number | null
}

export interface Way {
  id: string
  direction: Direction
  type: WayType
  from: string
  to: string
  depart: string
  arrive: string
  total_hours: number
  flying_hours: number
  flights: number
  hub_nights: number
  changes: number
  us_transit: boolean
  airports: string[]
  tickets: string[]
  shared_ticket?: string | null
  paired_with?: string | null
  price_dkk: number
  extras: Extras
  score: number
  flags?: string[]
  timeline: TimelineItem[]
}

export interface Rating {
  total: number
  price: number
  way_in: number
  way_home: number
}

export interface Option {
  id: string
  type: WayType
  entry: string
  exit: string
  way_in: string
  way_home: string
  shared_ticket?: string | null
  price_dkk: number
  extras: Extras
  rating: Rating
}

export interface InOut {
  generated_at: string
  currency: string
  home: string[]
  rating: { formula: string; price_anchor_dkk: number; price_basis: string; way_score: string }
  airports: Record<string, Airport>
  tickets: Record<string, Ticket>
  ways: Record<string, Way>
  options: Option[]
}

// ---- map.json

export type Mode = 'bus' | 'shuttle' | 'chicken_bus' | 'colectivo' | 'train' | 'boat' | 'flight'

export interface Hostel {
  name: string
  dorm_dkk: number | null
  private_dkk: number | null
  rating?: number | null
  source?: string
  source_year?: number
  price_suspect?: boolean
}

export interface Profile {
  checked_at?: string
  image?: { url: string; page?: string; credit?: string; license?: string; w?: number; h?: number } | null
  tagline?: string | null
  summary?: string | null
  things_to_do?: string[]
  touristy?: number | null
  hostels?: Hostel[]
}

export interface MapNode {
  id: string
  name: string
  country: string
  lat: number
  lon: number
  type: string
  iata: string | null
  popularity: number
  why?: string
  profile?: Profile
}

export interface CrawledFlight {
  quote_id: string
  depart: string
  arrive: string
  hours: number
  price_dkk: number
  carriers: string[]
  via: string[]
  layover_h: (number | null)[]
  fare_brand?: string | null
  cabin_bag?: string | null
  checked_bag?: string | null
  overnight_layover?: boolean
  source?: string
}

export interface MapEdge {
  from: string
  to: string
  mode: Mode
  operator?: string
  duration_h?: number | null
  duration_range?: string
  price_dkk?: number | null
  frequency?: string | null
  overnight?: boolean
  border?: boolean
  both?: boolean
  source?: string
  notes?: string
  // crawled flights
  oneway_min_dkk?: number | null
  oneway_min_hours?: number | null
  fastest_hours?: number | null
  fastest_price_dkk?: number | null
  nonstop?: boolean
  vias?: string[]
  carriers?: string[]
  dates?: string[]
  flights?: CrawledFlight[]
}

export interface MapData {
  nodes: MapNode[]
  edges: MapEdge[]
}

export interface BagRule {
  match: string
  longhaul_dkk?: number | null
  regional_dkk?: number | null
  cabin_dkk?: number | null
  note?: string
}

export interface TripParams {
  main_dates?: { out?: string; home?: string }
  [key: string]: unknown
}

/** data/web/meta.json: when the site was built and when each kind of data was last checked.
 *  A last_checked value is a bare date "2026-10-29", a full ISO time, or null when unknown. */
export interface Meta {
  built_at: string | null
  last_checked: Record<string, string | null>
}

export interface AppData {
  inout: InOut
  map: MapData
  bags: BagRule[]
  trip: TripParams
  source: 'github' | 'local'
  /** null when meta.json could not be read */
  meta: Meta | null
}
