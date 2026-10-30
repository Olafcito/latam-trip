import type { CrawledFlight, MapData } from '../data/types'
import type { Journey } from './journey'
import { iataOf } from './prices'

// A flight picked on Momondo arrives as /?trip=<id>&pick=<json>. Anyone can write a link, so it is
// read field by field, and a link that is off changes nothing.

export interface Pick {
  from: string
  to: string
  flight: CrawledFlight
}

const IATA = /^[A-Z]{3}$/
const LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const MAX_TEXT = 80

const isText = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_TEXT
const textOrNull = (v: unknown) => (isText(v) ? v : null)
const isDate = (v: unknown): v is string => typeof v === 'string' && LOCAL.test(v) && !Number.isNaN(Date.parse(`${v}Z`))
const isCode = (v: unknown): v is string => typeof v === 'string' && IATA.test(v)
const inRange = (v: unknown, low: number, high: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= low && v <= high

function toPick(v: unknown): Pick | null {
  if (typeof v !== 'object' || v === null) return null
  const p = v as Record<string, unknown>
  const { from, to, dep, arr, hours, stops, via, layover_h: waits, carriers, price } = p
  if (!isCode(from) || !isCode(to) || !isDate(dep) || !isDate(arr)) return null
  if (!inRange(price, 1, 500000) || !inRange(hours, 0, 200) || !inRange(stops, 0, 9)) return null
  if (!Array.isArray(carriers) || !carriers.length || !carriers.every(isText)) return null
  if (!Array.isArray(via) || !via.every(isCode)) return null
  if (!Array.isArray(waits) || !waits.every((w) => w === null || inRange(w, 0, 200))) return null
  return {
    from,
    to,
    flight: {
      quote_id: `pick-${from}-${to}-${dep}-${carriers.join('+')}`,
      depart: dep,
      arrive: arr,
      hours,
      price_dkk: price,
      carriers: carriers as string[],
      via: via as string[],
      layover_h: waits as (number | null)[],
      stops,
      overnight_layover: p.overnight === true,
      source: 'momondo-manual',
      observed_at: textOrNull(p.seen),
      site: textOrNull(p.site),
      fare_brand: textOrNull(p.fare_brand),
      cabin_bag: textOrNull(p.cabin_bag),
      checked_bag: textOrNull(p.checked_bag),
      self_transfer: p.self_transfer === true,
      airport_change: p.airport_change === true,
    },
  }
}

/** The flight in the address, 'bad' when there is one that cannot be read, null when there is none. */
export function readPick(search: string): Pick | 'bad' | null {
  const raw = new URLSearchParams(search).get('pick')
  if (raw === null) return null
  try {
    return toPick(JSON.parse(raw)) ?? 'bad'
  } catch {
    return 'bad'
  }
}

/** The page address without the pick, so a reload does not pick the flight again. */
export function withoutPick(href: string): string {
  const u = new URL(href)
  u.searchParams.delete('pick')
  return u.pathname + u.search + u.hash
}

/** The stop whose leg the flight flies, the one on its day when the trip flies the route twice, else -1. */
export function pickedLeg(j: Journey, map: MapData, pick: Pick): number {
  const legs = j.places.flatMap((p, i) => (p.hop && iataOf(map, p.hop.from) === pick.from && iataOf(map, p.hop.to) === pick.to ? [i] : []))
  const onDay = legs.find((i) => j.places[i].hop?.date === pick.flight.depart.slice(0, 10))
  return onDay ?? legs[0] ?? -1
}
