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

export interface Profile {
  checked_at?: string
  image?: { url: string; page?: string; credit?: string; license?: string; w?: number; h?: number } | null
  tagline?: string | null
  summary?: string | null
  things_to_do?: string[]
  touristy?: number | null
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
  /** when the price was seen */
  observed_at?: string | null
  /** stops, when the airports of some are not known; else via tells */
  stops?: number
  /** the site selling it */
  site?: string | null
  self_transfer?: boolean
  airport_change?: boolean
  /** a planned stay at the longest layover, not a wait */
  stopover?: boolean
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
  source: 'project'
  /** null when meta.json could not be read */
  meta: Meta | null
}

// ---- bookings (the owner only table of 0013_bookings.sql)

export type BookingKind = 'flight' | 'bus' | 'boat' | 'stay' | 'other'

/**
 * A file of a booking in the private bucket. The connector writes the entry before the upload with a size of null,
 * which means the upload is not confirmed yet. The planner writes it after the upload, with the size.
 */
export interface BookingFile {
  path: string
  name: string
  type: string
  size: number | null
  added_at: string
}

/** One leg or one stay that is paid for. depart and arrive are local times, "2026-12-08" or "2026-12-08T06:15". */
export interface Booking {
  id: string
  kind: BookingKind
  status: 'booked' | 'cancelled'
  from_code: string | null
  to_code: string | null
  depart: string | null
  arrive: string | null
  place_id: string | null
  check_in: string | null
  check_out: string | null
  lodging_id: string | null
  room_id: string | null
  reference: string | null
  seller: string | null
  /** the seller's own order number, shared by the rows of one ticket (0015) */
  seller_reference?: string | null
  /** the fare name, "Light" or "Classic" (0015) */
  fare?: string | null
  /** the link to the confirmation mail, optional because rows read before 0016 lack it */
  mail_url?: string | null
  url: string | null
  price_dkk: number | null
  price: number | null
  currency: string | null
  refundable: 'yes' | 'no' | 'partly' | null
  changeable: 'yes' | 'no' | 'fee' | null
  change_until: string | null
  cancel_until: string | null
  cabin_bag: string | null
  checked_bag: string | null
  segments: unknown[] | null
  travellers: number
  trip_id: string | null
  /** rows of one ticket share this value, and the first of them holds the price */
  ticket: string | null
  source: 'picked' | 'manual' | 'claude' | null
  notes: string | null
  attachments: BookingFile[]
  created_at: string
  updated_at: string
}

// ---- places to stay (the owner only tables of 0014_lodgings.sql), never in a built file

export type LodgingKind = 'hostel' | 'hotel' | 'guesthouse' | 'apartment' | 'other'
export type LodgingSite = 'booking' | 'hostelworld' | 'airbnb' | 'own' | 'other'
export type LodgingTag = 'beach' | 'pool' | 'social' | 'quiet' | 'kitchen' | 'breakfast' | 'aircon' | 'workspace'

/** A price for a room over a date range, as the sites quote it. It has a total, a price per night or both. */
export interface LodgingPrice {
  id: string
  room_id: string
  check_in: string
  check_out: string
  total_dkk: number | null
  per_night_dkk: number | null
  site: LodgingSite | null
  url: string | null
  refundable: 'yes' | 'no' | 'partly' | null
  cancel_until: string | null
  observed_at: string
}

/** A room of a place to stay, with its prices by date. */
export interface LodgingRoom {
  id: string
  lodging_id: string
  name: string
  beds: number | null
  private: boolean | null
  bathroom: 'private' | 'shared' | null
  notes: string | null
  created_at: string
  updated_at: string
  prices: LodgingPrice[]
}

/** A place to stay that Simon added, or asked Claude to add, with its rooms by name. */
export interface Lodging {
  id: string
  place_id: string
  name: string
  kind: LodgingKind
  photos: { url: string; caption: string | null }[]
  rating: number | null
  reviews: number | null
  rating_source: string | null
  address: string | null
  lat: number | null
  lon: number | null
  to_center_km: number | null
  to_beach_km: number | null
  tags: LodgingTag[]
  summary: string | null
  notes: string | null
  links: { site: LodgingSite; url: string }[]
  added_by: 'simon' | 'claude'
  hidden: boolean
  created_at: string
  updated_at: string
  rooms: LodgingRoom[]
}
