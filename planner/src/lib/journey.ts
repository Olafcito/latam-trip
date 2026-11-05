import type { Airport, Booking, MapNode } from '../data/types'
import { shortPlace } from './format'

// The booked pane reads a purchase as journeys. One booking row is one journey: the way of one leg of the trip,
// with the flights inside it when it changes plane on the way. The rows of one purchase share their ticket. A
// return is only ever called a return when the trip itself says so, through its way in and way home, never
// because two rows share a ticket. Everything here reads the rows alone, so any seller, airline or number of
// flights works.

/** One flight of a journey, read leniently from the row's segments, or the row itself when it has none. */
export interface JourneyFlight {
  from: string
  to: string
  /** local "YYYY-MM-DDTHH:MM", or a day, or null */
  depart: string | null
  arrive: string | null
  /** the airline as the row names it, "JetSMART" */
  carrier: string | null
  /** the flight number as written, "JA5451" or "5451" */
  number: string | null
  /** the two letter airline code, from the number or the airline's name */
  code: string | null
  /** who flies it when that is another airline, "Aires" */
  operatedBy: string | null
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** Airline names as rows and sellers write them, to their two letter code. Lower case, letters and digits only. */
const NAME_CODE: Record<string, string> = {
  klm: 'KL', klmroyaldutchairlines: 'KL', airfrance: 'AF', latam: 'LA', latamairlines: 'LA', copa: 'CM', copaairlines: 'CM',
  avianca: 'AV', aeromexico: 'AM', aireuropa: 'UX', iberia: 'IB', americanairlines: 'AA', american: 'AA', unitedairlines: 'UA', united: 'UA',
  delta: 'DL', deltaairlines: 'DL', tap: 'TP', tapairportugal: 'TP', lufthansa: 'LH', britishairways: 'BA', viva: 'VB', vivaaerobus: 'VB',
  volaris: 'Y4', qatar: 'QR', qatarairways: 'QR', norwegian: 'DY', swiss: 'LX', turkishairlines: 'TK', aerolineasargentinas: 'AR',
  gol: 'G3', azul: 'AD', spirit: 'NK', spiritairlines: 'NK', frontier: 'F9', jetblue: 'B6', emirates: 'EK', jetsmart: 'JA',
}

/** The airlines with a logo file in public/logos, by code. JetSMART's is a picture, the others are drawings. */
const AIRLINE_LOGO: Record<string, string> = Object.fromEntries([
  ...['KL', 'AF', 'LA', 'CM', 'AV', 'AM', 'UX', 'IB', 'AA', 'UA', 'DL', 'TP', 'LH', 'BA', 'VB', 'Y4', 'QR', 'DY', 'LX', 'TK', 'AR', 'G3', 'AD', 'NK', 'F9', 'B6', 'EK'].map((c) => [c, `airline-${c}.svg`]),
  ['JA', 'airline-JA.png'],
])

/** Sellers that are not airlines, with a logo file. Travellink has none yet and is set as its name. */
const SELLER_LOGO: Record<string, string> = { bookingcom: 'booking.svg', booking: 'booking.svg', expedia: 'expedia.svg' }

const key = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** The two letter code an airline name stands for, or null. */
export function codeOfName(name: string | null | undefined): string | null {
  return name ? NAME_CODE[key(name)] ?? null : null
}

/** The airline code a flight number starts with, "JA5451" to "JA". */
export function codeOfNumber(number: string | null | undefined): string | null {
  const m = number?.trim().toUpperCase().match(/^([A-Z0-9]{2})\s?\d{1,4}[A-Z]?$/)
  return m && /[A-Z]/.test(m[1]) ? m[1] : null
}

/** A logo file under public/logos, with the base the app is served from. */
const logoUrl = (file: string) => `${import.meta.env?.BASE_URL ?? '/'}logos/${file}`

/** The logo of an airline, by its code or its name, or null when there is no file for it. */
export function airlineLogo(code: string | null | undefined, name?: string | null): string | null {
  const c = code ?? codeOfName(name)
  const file = c ? AIRLINE_LOGO[c.toUpperCase()] : undefined
  return file ? logoUrl(file) : null
}

/** The logo of whoever sold the ticket: an airline's own, a seller's, or null to set the name instead. */
export function sellerLogo(seller: string | null | undefined): string | null {
  if (!seller) return null
  const own = SELLER_LOGO[key(seller)]
  return own ? logoUrl(own) : airlineLogo(null, seller)
}

export const gmailLogo = () => logoUrl('gmail.svg')

/** The flights of a row: its segments, or the row as one flight when it lists none. */
export function flightsOf(b: Pick<Booking, 'from_code' | 'to_code' | 'depart' | 'arrive' | 'segments'>): JourneyFlight[] {
  const segs = (b.segments ?? []).flatMap((v): JourneyFlight[] => {
    if (!v || typeof v !== 'object') return []
    const o = v as Record<string, unknown>
    const from = str(o.from) ?? str(o.origin)
    const to = str(o.to) ?? str(o.destination)
    if (!from || !to) return []
    const carrier = str(o.carrier) ?? str(o.airline)
    const number = str(o.number) ?? str(o.flight) ?? str(o.flight_number)
    const code = str(o.carrier_code) ?? codeOfNumber(number) ?? codeOfName(carrier)
    const operatedBy = str(o.operated_by) ?? str(o.operator)
    return [{ from, to, depart: str(o.depart), arrive: str(o.arrive), carrier, number, code, operatedBy: operatedBy && operatedBy !== carrier ? operatedBy : null }]
  })
  if (segs.length) return segs
  if (!b.from_code || !b.to_code) return []
  return [{ from: b.from_code, to: b.to_code, depart: b.depart, arrive: b.arrive, carrier: null, number: null, code: null, operatedBy: null }]
}

/** The airport codes a journey passes, in order: "ADZ", "MDE", "SMR". */
export function codesOf(flights: readonly JourneyFlight[]): string[] {
  return flights.length ? [flights[0].from, ...flights.map((f) => f.to)] : []
}

/** The flight number as it reads on a ticket: the airline code and the number together, "JA5451". */
export function flightLabel(f: Pick<JourneyFlight, 'number' | 'code'>): string | null {
  if (!f.number) return null
  const n = f.number.replace(/\s+/g, '').toUpperCase()
  return /^\d/.test(n) && f.code ? `${f.code}${n}` : n
}

/** Hours between two local stamps at the same airport, or null when one has no clock time. */
export function waitHours(a: string | null, b: string | null): number | null {
  if (!a || !b || a.length < 16 || b.length < 16) return null
  const h = (Date.parse(b.slice(0, 16) + 'Z') - Date.parse(a.slice(0, 16) + 'Z')) / 3.6e6
  return Number.isFinite(h) && h >= 0 ? h : null
}

/** The other booked rows of the purchase, in the order they fly. Empty for a row without a ticket. */
export function ticketRows(b: Booking, list: readonly Booking[]): Booking[] {
  if (!b.ticket) return []
  return list
    .filter((r) => r.status === 'booked' && r.ticket === b.ticket && r.id !== b.id)
    .sort((x, y) => (x.depart ?? '￿').localeCompare(y.depart ?? '￿') || x.id.localeCompare(y.id))
}

/** How another journey of the purchase relates to the one on screen. */
export type Relation = 'return' | 'outbound' | 'also'

/** The trip's way in and way home, when the pane is one of them. The only thing that makes a return. */
export interface WayPair { in: Booking | null; home: Booking | null }

export function relationOf(here: Booking, other: Booking, ways?: WayPair | null): Relation {
  if (ways?.in && ways.home) {
    if (here.id === ways.in.id && other.id === ways.home.id) return 'return'
    if (here.id === ways.home.id && other.id === ways.in.id) return 'outbound'
  }
  return 'also'
}

export const RELATION_TEXT: Record<Relation, string> = {
  return: 'Return flight included',
  outbound: 'Outbound flight included',
  also: 'Also on this purchase',
}

export interface Place { code: string; name: string; lat: number; lon: number }

export interface PlaceData {
  inout: { airports: Record<string, Pick<Airport, 'name' | 'lat' | 'lon' | 'map_node'> & Partial<Pick<Airport, 'country' | 'utc_offset'>>> }
  map: { nodes: readonly Pick<MapNode, 'id' | 'iata' | 'name' | 'lat' | 'lon' | 'profile'>[] }
}

/** The map place an airport serves: the one its code names, or the one the long-haul airport points at. */
function nodeOf(code: string, data: PlaceData) {
  const own = data.map.nodes.find((n) => n.iata === code)
  if (own) return own
  const id = data.inout.airports[code]?.map_node
  return id ? data.map.nodes.find((n) => n.id === id) : undefined
}

/** Where an airport is and the city it serves, or null when neither list knows it. */
export function placeOf(code: string, data: PlaceData): Place | null {
  const a = data.inout.airports[code]
  const n = nodeOf(code, data)
  const lat = a?.lat ?? n?.lat
  const lon = a?.lon ?? n?.lon
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  const name = n?.name ?? a?.name ?? code
  return { code, name: shortPlace(name), lat, lon }
}

/** The city an airport serves, or its code. */
export function cityName(code: string, data: PlaceData): string {
  const n = nodeOf(code, data)
  return shortPlace(n?.name ?? data.inout.airports[code]?.name ?? code)
}

export interface Photo { url: string; credit: string | null }

/** The photo of the place an airport serves, or null. Only an https address is taken. */
export function photoOf(code: string, data: PlaceData): Photo | null {
  const img = nodeOf(code, data)?.profile?.image
  const url = img?.url?.trim()
  return url && /^https:\/\//i.test(url) ? { url, credit: img?.credit ?? null } : null
}

/** A link the pane may open: http or https only. Anything else gives no link. */
export function safeLink(u: string | null | undefined): string | null {
  const t = u?.trim()
  return t && /^https?:\/\//i.test(t) ? t : null
}

/** The confirmation mail of a row, as a link to open, or null. */
export function mailLink(b: Pick<Booking, 'mail_url'>): string | null {
  const t = b.mail_url?.trim()
  return t && /^https:\/\//i.test(t) ? t : null
}
