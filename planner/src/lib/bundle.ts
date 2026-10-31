import type { Family } from '@map/data/types'
import type { MapNode } from '../data/types'
import { shortPlace } from './format'
import type { Journey, Schedule } from './journey'
import { familyOf } from './route'

// Groups a trip's stops into the places you would name to a friend, so the summary map can open a
// country into them. Every night stays counted.

export interface RouteStop {
  id: string
  name: string
  country: string
  nights: number
  /** how you arrived here */
  mode: Family
  type: string
  lat: number
  lon: number
}

export interface BundledPlace {
  name: string
  kind: 'stay' | 'chain' | 'islands'
  nights: number
  /** every stop it holds, its transits too, as indexes into the trip's stops */
  stops: number[]
  /** the stops of its own run, without the transits folded in */
  own: number[]
  anchor: number
  /** where a chain starts and ends, empty for the others */
  ends: number[]
}

export interface BundledCountry {
  code: string
  nights: number
  stops: number[]
  places: BundledPlace[]
}

interface Run { own: number[]; stops: number[]; closed: boolean; islands: boolean }

/** A stay this long stands alone. */
const BASE = 5
/** A stretch this short on its own is a transit. */
const SHORT = 2

const sailedTo = (s: RouteStop) => s.type === 'island' && s.mode === 'boat'

const starts = (s: RouteStop, run: Run | null) => {
  if (!run) return true
  if (s.nights === 0) return false // passing through stays with what came before
  if (sailedTo(s)) return false // islands stay with the stop you sailed from
  if (s.mode === 'flight') return true // a flight is a new area
  return run.closed || s.nights >= BASE // a long stay stands alone, shorter stops by road chain together
}

function runsOf(ids: number[], stops: RouteStop[]) {
  const out: Run[] = []
  let run: Run | null = null
  for (const i of ids) {
    const s = stops[i]
    if (starts(s, run)) out.push(run = { own: [], stops: [], closed: false, islands: false })
    run!.islands ||= sailedTo(s)
    run!.own.push(i)
    run!.stops.push(i)
    run!.closed ||= s.nights >= BASE || s.type === 'island'
  }
  return out
}

const nightsOf = (ids: number[], stops: RouteStop[]) => ids.reduce((n, i) => n + stops[i].nights, 0)

// A short stop on its own is a transit, so its nights move to the next stay, or the last one at the end of a country.
function fold(list: Run[], stops: RouteStop[]) {
  for (let i = 0; i < list.length && list.length > 1;) {
    if (nightsOf(list[i].stops, stops) > SHORT) { i++; continue }
    const [gone] = list.splice(i, 1)
    const into = list[i] ?? list[i - 1]
    into.stops = [...gone.stops, ...into.stops].sort((a, b) => a - b)
  }
  return list
}

function placeOf(run: Run, stops: RouteStop[]): BundledPlace {
  const slept = run.own.filter((i) => stops[i].nights > 0)
  // a country only passed through has nowhere you slept
  const named = slept.length ? slept : run.own
  const first = stops[named[0]].name
  const last = stops[named[named.length - 1]].name
  const longest = run.stops.reduce((a, i) => (stops[i].nights > stops[a].nights ? i : a))
  const chain = !run.islands && slept.length > 1
  return {
    name: run.islands ? `${first} and islands` : chain ? `${first} to ${last}` : stops[longest].name,
    kind: run.islands ? 'islands' : chain ? 'chain' : 'stay',
    nights: nightsOf(run.stops, stops),
    stops: run.stops,
    own: run.own,
    anchor: chain ? named[named.length - 1] : run.islands ? named[0] : longest,
    ends: chain ? [named[0], named[named.length - 1]] : [],
  }
}

export function bundle(stops: RouteStop[]): BundledCountry[] {
  const out: BundledCountry[] = []
  stops.forEach((s, i) => {
    const last = out[out.length - 1]
    if (last?.code === s.country) last.stops.push(i)
    else out.push({ code: s.country, nights: 0, stops: [i], places: [] })
  })
  for (const c of out) {
    c.nights = nightsOf(c.stops, stops)
    c.places = fold(runsOf(c.stops, stops), stops).map((r) => placeOf(r, stops))
  }
  return out
}

/** The stop where a place begins, so a flag sits where you reach its country. */
export const entryOf = (p: BundledPlace) => (p.kind === 'chain' ? p.ends[0] : p.anchor)

/** "Tolu (Golfo de Morrosquillo airport)" -> "Tolu", as you would say it to a friend. */
const spoken = (name: string) => shortPlace(name).split(' / ')[0].replace(/ coast$/, '').replace(/ de la Sierra$/, '')

/** A journey's stops as the summary map reads them. A stop whose node left the data is skipped. */
export function routeStops(map: { nodes: MapNode[] }, journey: Journey, sched: Schedule): RouteStop[] {
  return journey.places.flatMap((p, i) => {
    const node = map.nodes.find((n) => n.id === p.node)
    if (!node) return []
    return [{
      id: p.node,
      name: spoken(node.name),
      country: node.country,
      nights: sched.places[i]?.days ?? 0,
      mode: p.hop ? familyOf(p.hop.mode) : 'ground',
      type: node.type,
      lat: node.lat,
      lon: node.lon,
    }]
  })
}
