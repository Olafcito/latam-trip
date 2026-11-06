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
  /** the airline as the row names it */
  carrier: string | null
  /** the flight number as written, "XX1234" or "1234" */
  number: string | null
  /** the two letter airline code, from the number or the airline's name */
  code: string | null
  /** who flies it when that is another airline */
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

/** Sellers that are not airlines, with a logo file. */
const SELLER_LOGO: Record<string, string> = { bookingcom: 'booking.svg', booking: 'booking.svg', expedia: 'expedia.svg', travellink: 'travellink.png', travellinkdk: 'travellink.png',
  airbnb: 'provider-airbnb.svg', hotelscom: 'provider-hotels-com.svg', tripadvisor: 'provider-tripadvisor.svg', tripcom: 'provider-trip-com.svg',
  trivago: 'provider-trivago.svg', googlehotels: 'provider-google.svg', google: 'provider-google.svg', hilton: 'provider-hilton.svg', marriott: 'provider-marriott.svg',
  hostelworld: 'provider-hostelworld.png', agoda: 'provider-agoda.svg', vrbo: 'provider-vrbo.svg', kayak: 'provider-kayak.svg',
  despegar: 'provider-despegar.svg', despegarcom: 'provider-despegar.svg', priceline: 'provider-priceline.png', pricelinecom: 'provider-priceline.png',
  hostelz: 'provider-hostelz.png', hostelzcom: 'provider-hostelz.png', selina: 'provider-selina.svg',
}

const key = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** The two letter code an airline name stands for, or null. */
export function codeOfName(name: string | null | undefined): string | null {
  return name ? NAME_CODE[key(name)] ?? null : null
}

/** The airline code a flight number starts with, "XX1234" to "XX". */
export function codeOfNumber(number: string | null | undefined): string | null {
  const m = number?.trim().toUpperCase().match(/^([A-Z0-9]{2})\s?\d{1,4}[A-Z]?$/)
  return m && /[A-Z]/.test(m[1]) ? m[1] : null
}

/** The logo files, bundled with the app since it serves no public folder: file name to its address. */
const LOGO_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(import.meta.glob('../assets/logos/*.{svg,png}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>)
    .map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1), url]),
)
const logoUrl = (file: string) => LOGO_FILES[file] ?? null

/** Airlines whose full logo is too wide to read small. In a tight spot they show their mark instead. */
const WIDE = new Set(['AR', 'AM', 'AF', 'AA', 'BA', 'CM', 'DL', 'F9', 'KL', 'LH', 'DY', 'TP', 'TK', 'UA'])

/**
 * The logo of an airline, by its code or its name, or null when there is no file for it. On a dark ground its dark
 * parts are drawn light. With mark, or when the full logo is too wide, the airline's compact mark when it has one.
 */
export function airlineLogo(code: string | null | undefined, name?: string | null, opts: { on?: 'dark'; mark?: boolean } = {}): string | null {
  const c = (code ?? codeOfName(name))?.toUpperCase()
  const file = c ? AIRLINE_LOGO[c] : undefined
  if (!c || !file) return null
  const light = opts.on === 'dark' ? '-light' : ''
  const full = file.replace(/\.(svg|png)$/, `${light}.$1`)
  const tries = opts.mark || WIDE.has(c) ? [`airline-${c}-icon${light}.svg`, full, file] : [full, file]
  for (const t of tries) {
    const url = logoUrl(t)
    if (url) return url
  }
  return null
}

/** The logo of whoever sold the ticket: an airline's own mark, a seller's, or null to set the name instead. */
export function sellerLogo(seller: string | null | undefined): string | null {
  if (!seller) return null
  const own = SELLER_LOGO[key(seller)]
  return own ? logoUrl(own) : airlineLogo(null, seller, { mark: true })
}

export const gmailLogo = () => logoUrl('gmail.svg') ?? ''

/** Logos that are already a filled rounded square, an app icon, and fill their tile edge to edge. */
const TILE_FILES = ['provider-hostelworld.png']
export const isTileLogo = (url: string | null | undefined) => !!url && TILE_FILES.some((f) => logoUrl(f) === url)

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

/** The airport codes a journey passes, in order. */
export function codesOf(flights: readonly JourneyFlight[]): string[] {
  return flights.length ? [flights[0].from, ...flights.map((f) => f.to)] : []
}

/** The flight number as it reads on a ticket: the airline code and the number together, "XX1234". */
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

export interface PlaceData {
  inout: { airports: Record<string, Pick<Airport, 'name' | 'lat' | 'lon' | 'map_node'> & Partial<Pick<Airport, 'country' | 'utc_offset'>>> }
  map: { nodes: readonly Pick<MapNode, 'id' | 'iata' | 'name' | 'lat' | 'lon' | 'profile'>[] }
}

/** The map place an airport serves: the one its code names, or the one the long-haul airport points at. */
function nodeOf(code: string, data: PlaceData) {
  // a bus or a boat names its ends by the place itself
  const own = data.map.nodes.find((n) => n.iata === code) ?? data.map.nodes.find((n) => n.id === code)
  if (own) return own
  const id = data.inout.airports[code]?.map_node
  return id ? data.map.nodes.find((n) => n.id === id) : undefined
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
