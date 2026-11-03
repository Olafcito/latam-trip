import type { CrawledFlight } from '../data/types'
import { hours } from './format'
import { bagMark, LONG_WAIT_H, nightMark, type Mark } from './marks'
import { sourceLabel, type PairQuote } from './prices'
import { addDays } from './time'
import { nights } from './waytrack'

// The fares known for a day as the rows of the flight sheet. A quote from pair_dates and a flight
// picked on a trip take one shape, so a picked flight and the day's list read the same.

export type FareSort = 'cheap' | 'fast' | 'early'

export interface FareRow {
  flight: CrawledFlight
  /** the other sites that sell the same flight, dearer or as cheap */
  others: string[]
}

/** Whether the flight's times are known. A price can be seen without them. */
export const timed = (f: CrawledFlight) => f.depart.length > 10 && f.arrive.length > 10

/** How many stops, also when the row does not know where. */
export const stopsOf = (f: CrawledFlight) => f.stops ?? f.via.length

/** Whether two sightings are one flight. A picked flight's id can be in another format than the day's rows. */
export const sameFlight = (a: CrawledFlight, b: CrawledFlight) => a.depart === b.depart && a.arrive === b.arrive && a.carriers.join() === b.carriers.join()

/** The site selling a flight, or else where the price was seen. */
export function seller(f: CrawledFlight): string {
  if (f.site) return f.site === 'Flyselskab' ? 'The airline' : f.site
  return sourceLabel(f.source)
}

/** A known price as a flight. */
export function quoteFlight(q: PairQuote, from: string, to: string, date: string): CrawledFlight {
  const lands = addDays(date, q.n ?? 0)
  return {
    quote_id: `${from}-${to}-${date}-${q.d ?? ''}-${q.a ?? ''}-${q.c.join('+')}`,
    depart: q.d ? `${date}T${q.d}` : date,
    arrive: q.a ? `${lands}T${q.a}` : lands,
    hours: q.h,
    price_dkk: q.p,
    carriers: q.c,
    via: q.v ?? [],
    layover_h: q.w ?? [],
    stops: q.s,
    overnight_layover: q.o,
    source: q.src ?? undefined,
    observed_at: q.at,
    site: q.ag ?? null,
    self_transfer: q.f?.includes('self_transfer'),
    airport_change: q.f?.includes('airport_change'),
    stopover: q.f?.includes('stopover'),
  }
}

/** A day's quotes, one row for each flight: the same times, airlines and stops seen at several sites are one row at its cheapest. */
export function fareRows(quotes: PairQuote[], from: string, to: string, date: string): FareRow[] {
  const rows = new Map<string, FareRow>()
  for (const q of [...quotes].sort((a, b) => a.p - b.p || a.h - b.h)) {
    // without times two rows cannot be told to be one flight
    const key = q.d && q.a ? [q.d, q.a, q.n ?? 0, q.s, q.c.join('+')].join('|') : `${q.p}|${q.h}|${q.c.join('+')}`
    const row = rows.get(key)
    const flight = quoteFlight(q, from, to, date)
    if (!row) {
      rows.set(key, { flight, others: [] })
      continue
    }
    const site = seller(flight)
    if (site !== seller(row.flight) && !row.others.includes(site)) row.others.push(site)
    // a dearer row can know the stops the cheapest was read without
    if (!row.flight.via.length && flight.via.length) row.flight = { ...row.flight, via: flight.via, layover_h: flight.layover_h }
  }
  return [...rows.values()]
}

/** The rows in the chosen order. Rows without times go last when the order needs them. */
export function sortFares(rows: FareRow[], by: FareSort): FareRow[] {
  const price = (a: FareRow, b: FareRow) => a.flight.price_dkk - b.flight.price_dkk
  const known = (a: FareRow, b: FareRow) => Number(timed(b.flight)) - Number(timed(a.flight))
  if (by === 'cheap') return [...rows].sort(price)
  if (by === 'fast') return [...rows].sort((a, b) => known(a, b) || a.flight.hours - b.flight.hours || price(a, b))
  return [...rows].sort((a, b) => known(a, b) || a.flight.depart.localeCompare(b.flight.depart) || price(a, b))
}

/** The marks of a flight row: on its stops by place in via, on the times it leaves and lands, and on the row itself. */
export interface FareMarks {
  stops: (Mark | null)[]
  leaves: Mark | null
  lands: Mark | null
  badges: Mark[]
}

/**
 * What about a flight changes the plan around it, as marks. The longest wait is marked on its stop as a
 * stopover, a night or a long wait. nextDay is the day the next leg leaves, a landing after it is marked bad.
 */
export function fareMarks(f: CrawledFlight, name: (code: string) => string, nextDay: string | null): FareMarks {
  const stops: (Mark | null)[] = f.via.map(() => null)
  const badges: Mark[] = []
  if (f.self_transfer) badges.push({ kind: 'self', label: 'Self transfer, you check in again', tone: 'part' })
  if (f.airport_change) badges.push({ kind: 'airport', label: 'Changes airport on the way', tone: 'part' })
  const longest = f.layover_h.reduce<number>((at, h, i) => ((h ?? 0) > (f.layover_h[at] ?? 0) ? i : at), 0)
  const code = f.via[longest]
  const where = code ? ` in ${name(code)}` : ''
  const wait = f.layover_h[longest] ?? 0
  const stop: Mark | null = f.stopover ? { kind: 'stopover', label: `Stopover${where}${wait ? `, ${nights(Math.max(1, Math.round(wait / 24)))}` : ''}` }
    : f.overnight_layover ? { kind: 'night', label: `A night${where}` }
      : wait >= LONG_WAIT_H ? { kind: 'wait', label: `Long wait${where}, ${hours(wait)}`, tone: 'part' }
        : null
  // a stop whose airport is not known carries its mark on the row
  if (stop && code) stops[longest] = stop
  else if (stop) badges.push(stop)
  for (const m of [bagMark('cabin', f.cabin_bag), bagMark('checked', f.checked_bag)]) if (m) badges.push(m)
  if (!timed(f)) return { stops, leaves: null, lands: null, badges }
  const late = !!nextDay && f.arrive.slice(0, 10) > nextDay
  return {
    stops,
    leaves: nightMark(f.depart, 'leaves'),
    lands: late ? { kind: 'late', label: 'Lands after the next leg leaves', tone: 'bad' } : nightMark(f.arrive, 'lands'),
    badges,
  }
}
