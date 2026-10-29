import type { Meta } from '../data/types'

/** Data checked more than this many days ago is stale and turns amber. */
export const STALE_DAYS = 3

export interface Fresh {
  type: string
  at: string | null
  /** whole calendar days since the check, in the viewer's time zone. null when unknown */
  ageDays: number | null
  stale: boolean
}

const DAY = 86400000
const BARE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Local midnight of the day a check happened. A bare date is that calendar day, an ISO time is
 *  the day it fell on here. null when the value does not parse. */
function dayOf(at: string): number | null {
  const m = BARE_DATE.exec(at)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(at)
  if (Number.isNaN(d.getTime())) return null
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function ageOf(at: string | null, now: number): number | null {
  if (at == null) return null
  const then = dayOf(at)
  if (then == null) return null
  const n = new Date(now)
  const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime()
  // round, because a day across a daylight saving change is 23 or 25 hours
  return Math.max(0, Math.round((today - then) / DAY))
}

/** null (or a value that does not parse) is not stale, it is unknown. */
export function isStale(at: string | null, now: number, days: number = STALE_DAYS): boolean {
  const age = ageOf(at, now)
  return age != null && age > days
}

/** One entry per key of last_checked, in key order. */
export function freshness(meta: Meta | null, now: number): Fresh[] {
  if (!meta?.last_checked) return []
  return Object.entries(meta.last_checked).map(([type, at]) => {
    const ageDays = ageOf(at, now)
    return { type, at, ageDays, stale: ageDays != null && ageDays > STALE_DAYS }
  })
}

/** '?' for unknown, 'today', '1 d', '5 d'. */
export function ageLabel(ageDays: number | null): string {
  if (ageDays == null) return '?'
  return ageDays === 0 ? 'today' : `${ageDays} d`
}

/** The same age in words, for an accessible name: 'today', '1 day ago', '4 days ago'. */
export function ageWords(ageDays: number | null): string {
  if (ageDays == null) return 'at an unknown time'
  if (ageDays === 0) return 'today'
  return ageDays === 1 ? '1 day ago' : `${ageDays} days ago`
}

/** The type the header corner names. Flights, unless flights is fresh while another type is stale:
 *  then the stalest one, so amber text always names what is old. */
export function leadOf(list: Fresh[]): Fresh | null {
  if (!list.length) return null
  const flights = list.find((f) => f.type === 'flights')
  const stale = list.filter((f) => f.stale)
  if (stale.length && !flights?.stale) return stale.reduce((a, b) => ((b.ageDays ?? 0) > (a.ageDays ?? 0) ? b : a))
  return flights ?? list[0]
}
