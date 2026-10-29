import type { Family } from '@map/data/types'
import type { AppData } from '../data/types'
import { countryName } from './colors'
import { day } from './format'
import { legDay, nodeForAirport, nodeName, schedule, type Journey } from './journey'

// A trip as the countries it passes through, for the flag route on the Trips list and the trip hero.
// A leg leaves on the day set on it, else on its picked flight's day, else on an estimate from the
// days shared out between the dated legs around it.

export const familyOf = (mode: string): Family => (mode === 'flight' ? 'flight' : mode === 'boat' ? 'boat' : 'ground')

/** One country on the route: the stops in it in order, and how you got there from the country before. */
export interface RouteCountry {
  country: string
  /** the stops in this country in the order first reached. Empty for a country only crossed on an overland stretch. */
  places: string[]
  /** how you reach it from the country before. Null for the landing country. */
  via: Family | null
  /** true when the same hop also reached the country before, as on one overland stretch through three countries */
  same: boolean
  /** each stop in this country with its days there, in order, a stop visited twice twice */
  stops: { name: string; days: number }[]
  /** the days spent in this country, summed over its stops */
  days: number
  /** true when every stop's days are exact, false when any is a share of the days around it */
  exact: boolean
}

/** One leg of a trip with the day it leaves. The hook a fare lookup needs: from, to and date. */
export interface RouteLeg {
  key: string
  kind: 'in' | 'hop' | 'home'
  /** a map node id, or an airport code on the ways in and home */
  from: string
  to: string
  fromName: string
  toName: string
  family: Family
  /** the day it leaves, "2026-12-06". The day set on it, a picked flight's day, else an estimate. */
  date: string
  /** true when the date is set, booked or a picked flight's, false when it is estimated */
  dated: boolean
}

export interface TripRoute {
  home: { country: string; name: string }
  land: { node: string; name: string; country: string }
  out: { node: string; name: string; country: string }
  countries: RouteCountry[]
  legs: RouteLeg[]
}

/** The route of a trip, or null when its way in or way home has left the data. */
export function tripRoute(data: AppData, j: Journey): TripRoute | null {
  const { inout, map } = data
  const wi = inout.ways[j.wayIn]
  const wh = inout.ways[j.wayHome]
  if (!wi || !wh || !j.places.length) return null
  const nm = (id: string) => nodeName(map, inout, id)
  const countryOf = (id: string) => map.nodes.find((n) => n.id === id)?.country ?? inout.airports[id]?.country ?? ''
  const exit = nodeForAirport(inout, wh.from)

  const sched = schedule(j, wi, wh, exit, nm)

  // countries in order, the stops in one country run together
  const countries: RouteCountry[] = []
  let lastHop = -1
  const visit = (country: string, place: number | null, via: Family | null, hop: number) => {
    let c = countries[countries.length - 1]
    if (!c || c.country !== country) {
      c = { country, places: [], via, same: !!c && hop === lastHop, stops: [], days: 0, exact: true }
      countries.push(c)
    }
    if (place != null) {
      const name = nm(j.places[place].node)
      const sp = sched.places[place]
      if (!c.places.includes(name)) c.places.push(name)
      c.stops.push({ name, days: sp.days })
      c.days += sp.days
      c.exact &&= sp.exact
    }
    lastHop = hop
  }
  j.places.forEach((p, i) => {
    const c = countryOf(p.node)
    const h = p.hop
    if (!h) return visit(c, i, null, i)
    const via = familyOf(h.mode)
    const crossed = (h.countries ?? []).filter((x, k, all) => !(k === 0 && x === countries[countries.length - 1]?.country) && !(k === all.length - 1 && x === c))
    for (const x of crossed) visit(x, null, via, i)
    visit(c, i, via, i)
  })

  // the day each leg leaves: the day you leave the stop before it
  const legs: RouteLeg[] = [{
    key: 'in', kind: 'in', from: wi.from, to: j.places[0].node,
    fromName: inout.airports[wi.from]?.name ?? wi.from, toName: nm(j.places[0].node),
    family: 'flight', date: wi.depart.slice(0, 10), dated: true,
  }]
  j.places.forEach((p, i) => {
    if (!p.hop) return
    legs.push({
      key: `hop${i}`, kind: 'hop', from: j.places[i - 1].node, to: p.node,
      fromName: nm(j.places[i - 1].node), toName: nm(p.node),
      family: familyOf(p.hop.mode), date: legDay(p.hop, sched.places[i - 1].outDay), dated: !!(p.hop.date || p.hop.flight),
    })
  })
  legs.push({
    key: 'home', kind: 'home', from: wh.from, to: wh.to,
    fromName: nm(exit), toName: inout.airports[wh.to]?.name ?? wh.to,
    family: 'flight', date: wh.depart.slice(0, 10), dated: true,
  })

  const first = j.places[0].node
  return {
    home: { country: inout.airports[wi.from]?.country ?? 'DK', name: inout.airports[wi.from]?.name ?? wi.from },
    land: { node: first, name: nm(first), country: countryOf(first) },
    out: { node: exit, name: nm(exit), country: countryOf(exit) },
    countries,
    legs,
  }
}

/** "Copenhagen to Bogotá, Colombia, Peru, Bolivia, out from La Paz", with the price after it when given. */
export function routeLabel(r: TripRoute, price?: string): string {
  const names = r.countries.map((c) => countryName(c.country)).filter(Boolean)
  return [`${r.home.name} to ${r.land.name}`, ...names, `out from ${r.out.name}`, ...(price ? [price] : [])].join(', ')
}

/** "6 Dec" when a leg's day is known, "~6 Dec" when it is estimated. */
export const flyOn = (leg: RouteLeg) => `${leg.dated ? '' : '~'}${day(leg.date)}`

/** The legs a fare can be looked up for: the flights, in and home included. */
export const flightLegs = (r: TripRoute) => r.legs.filter((l) => l.family === 'flight')
