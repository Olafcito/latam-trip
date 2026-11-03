import type { Family } from '@map/data/types'
import type { RouteView } from './routeView'

// The itinerary laid over the foot of the trip map: a segment per country as wide as its nights, how
// you got there and whether that leg is booked. Choosing a country lights the route up to it.

export interface Segment {
  key: string
  code: string
  name: string
  nights: number
  /** its part of all the trip's nights, nothing for a country only passed through */
  share: number
  passing: boolean
  /** how you reach it, the first country by the way in */
  mode: Family
  booked: boolean
  /** the day you get there and the day you leave */
  first: string | null
  last: string | null
}

/** inBooked: the way in from home is booked, it brings you to the first country. */
export function ribbon(view: RouteView, inBooked = false): Segment[] {
  const all = view.countries.reduce((n, c) => n + c.n, 0) || 1
  return view.countries.map((c, ci) => {
    const s = view.stops[c.first]
    return {
      key: c.key, code: c.code, name: c.name, nights: c.n, share: c.n / all, passing: !c.n,
      mode: ci ? s.mode : 'flight',
      booked: ci ? !!s.booked : inBooked,
      first: s.inDay ?? null,
      last: view.stops[c.last].outDay ?? null,
    }
  })
}

/** The country you sleep in on this day, nothing before or after the trip. On a day you move it is the next one. */
export function hereAt(bar: Segment[], today: string): string | null {
  return bar.find((s) => !s.passing && s.first && s.last && s.first <= today && today < s.last)?.key ?? null
}

export interface Reveal {
  /** the leg into each stop after the first */
  legs: boolean[]
  countries: boolean[]
  /** the way home */
  home: boolean
}

/** What is lit when a country is chosen: the route up to its last stop. Nothing chosen lights it all. */
export function revealOf(view: RouteView, key: string | null): Reveal {
  const at = key == null ? -1 : view.countries.findIndex((c) => c.key === key)
  if (at < 0) return { legs: view.stops.slice(1).map(() => true), countries: view.countries.map(() => true), home: true }
  const end = view.countries[at].last
  return {
    legs: view.stops.slice(1).map((_, k) => k + 1 <= end),
    countries: view.countries.map((_, ci) => ci <= at),
    home: at === view.countries.length - 1,
  }
}
