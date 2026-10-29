import { boundsOf, pathThrough, type Bounds, type LonLat } from '../lib/geo'
import { familyOf, type AirportFlight, type Connection, type Family, type MapData, type Place, type RouteOption } from './types'

export interface Neighbour {
  conn: Connection
  other: Place
  options: RouteOption[] // the enabled options, fastest first
  fastest: number
}

/** Indexes over the raw data, built once per load. */
export interface Model {
  data: MapData
  places: Place[] // map places (no context airports)
  byId: Map<string, Place>
  byIata: Map<string, Place> // the place an airport code stands for, the airport's own city first
  conns: Map<string, Connection>
  byPlace: Map<string, Connection[]>
  home: Bounds
  routes: GeoJSON.FeatureCollection<GeoJSON.LineString, RouteProps>
  routeLines: Map<string, LonLat[]> // feature id -> coordinates, for the moving dot
}

export interface RouteProps {
  fid: string // `${connId}|${family}`
  cid: string
  family: Family
  side: number // -1, 0, 1: lateral offset when two straight rails share a pair
  a: string
  b: string
}

export const ALL_FAMILIES: Family[] = ['ground', 'boat', 'flight']

/** The option per family that the map draws for a pair: the fastest one. */
export function primaryOptions(conn: Connection): Map<Family, RouteOption> {
  const out = new Map<Family, RouteOption>()
  for (const o of conn.options) {
    const f = familyOf(o.mode)
    const cur = out.get(f)
    if (!cur || (o.duration_min ?? 1e9) < (cur.duration_min ?? 1e9)) out.set(f, o)
  }
  return out
}

export function otherEnd(conn: Connection, id: string): string {
  return conn.a === id ? conn.b : conn.a
}

/** Middle stops in travel order from `from` (the data lists them from a to b). */
export function stopsFrom(conn: Connection, opt: RouteOption, from: string) {
  return from === conn.a ? opt.stops : [...opt.stops].reverse()
}

export function buildModel(data: MapData): Model {
  const byId = new Map(data.places.map((p) => [p.id, p]))
  const places = data.places.filter((p) => !p.context)
  // several towns share an airport (Antigua flies from Guatemala City): the code names the city whose id it is
  const byIata = new Map<string, Place>()
  for (const p of data.places) if (p.iata && (!byIata.has(p.iata) || p.id === p.iata)) byIata.set(p.iata, p)
  // Context airports only give layovers a position. A connection that ends at one has no city to select, so it is left out.
  const usable = data.connections.filter((c) => [c.a, c.b].every((id) => byId.has(id) && !byId.get(id)!.context))
  const conns = new Map(usable.map((c) => [c.id, c]))
  const byPlace = new Map<string, Connection[]>()
  for (const c of usable) {
    for (const id of [c.a, c.b]) {
      if (!byPlace.has(id)) byPlace.set(id, [])
      byPlace.get(id)!.push(c)
    }
  }

  const features: GeoJSON.Feature<GeoJSON.LineString, RouteProps>[] = []
  const routeLines = new Map<string, LonLat[]>()
  for (const c of usable) {
    const a = byId.get(c.a)
    const b = byId.get(c.b)
    if (!a || !b) continue
    const prim = primaryOptions(c)
    const straight = [...prim.keys()].filter((f) => f !== 'flight')
    for (const [family, opt] of prim) {
      // a flight is one arc between its ends: drawn through its layovers it would look like a flight
      // between a layover and a city. viaLine draws that path only for the route in focus.
      const pts: LonLat[] = family === 'flight' ? [[a.lon, a.lat], [b.lon, b.lat]] : stopPoints(byId, c, opt)
      const coords = opt.geometry ?? pathThrough(pts, family === 'flight')
      const fid = `${c.id}|${family}`
      const side = straight.length > 1 && family !== 'flight' ? (family === 'ground' ? -1 : 1) : 0
      routeLines.set(fid, coords)
      features.push({
        type: 'Feature',
        id: fid,
        properties: { fid, cid: c.id, family, side, a: c.a, b: c.b },
        geometry: { type: 'LineString', coordinates: coords },
      })
    }
  }

  return {
    data,
    places,
    byId,
    byIata,
    conns,
    byPlace,
    home: boundsOf(places.map((p) => [p.lon, p.lat])),
    routes: { type: 'FeatureCollection', features },
    routeLines,
  }
}

function stopPoints(byId: Map<string, Place>, conn: Connection, opt: RouteOption): LonLat[] {
  const ids = [conn.a, ...opt.stops.map((s) => s.place_id), conn.b]
  return ids.map((id) => byId.get(id)).filter((p): p is Place => !!p).map((p) => [p.lon, p.lat])
}

/** A flight's path through its layovers, from a to b, or null when it has none. */
export function viaLine(model: Model, conn: Connection, opt: RouteOption): LonLat[] | null {
  if (familyOf(opt.mode) !== 'flight' || !opt.stops.length || opt.geometry) return null
  const pts = stopPoints(model.byId, conn, opt)
  return pts.length > 2 ? pathThrough(pts, true) : null
}

/** Neighbours of a place with only the enabled options, sorted by their fastest option. */
export function neighbours(model: Model, id: string, families: Set<Family>): Neighbour[] {
  const out: Neighbour[] = []
  for (const conn of model.byPlace.get(id) ?? []) {
    const other = model.byId.get(otherEnd(conn, id))
    if (!other) continue
    const options = conn.options
      .filter((o) => families.has(familyOf(o.mode)))
      .sort((x, y) => (x.duration_min ?? 1e9) - (y.duration_min ?? 1e9))
    if (!options.length) continue
    out.push({ conn, other, options, fastest: options[0].duration_min ?? 1e9 })
  }
  return out.sort((x, y) => x.fastest - y.fastest || x.other.name.localeCompare(y.other.name))
}

/** Screen-independent points of a route: both ends and every middle stop of the shown options. */
export function routePoints(model: Model, conn: Connection, options: RouteOption[]): LonLat[] {
  const ids = new Set([conn.a, conn.b])
  for (const o of options) for (const s of o.stops) ids.add(s.place_id)
  return [...ids].map((id) => model.byId.get(id)).filter((p): p is Place => !!p).map((p) => [p.lon, p.lat])
}

/** The via line: "via Panama City, Bogota" or "nonstop", from a's side. */
export function viaText(model: Model, conn: Connection, opt: RouteOption, from: string): string {
  const stops = stopsFrom(conn, opt, from)
  if (stops.length) return 'via ' + stops.map((s) => model.byId.get(s.place_id)?.short_name ?? s.place_id).join(', ')
  if (opt.mode === 'flight') {
    if (opt.flight?.nonstop) return 'nonstop'
    if (opt.flight?.vias.length) return 'via ' + opt.flight.vias.map((v) => model.byId.get(v)?.short_name ?? v).join(' or ')
    return ''
  }
  return opt.border ? 'direct, border crossing' : 'direct'
}

/** The crawled flights into (`in`) or out of (`out`) an airport, cheapest first as the data lists them. */
export function airportFlights(model: Model, iata: string, dir: 'in' | 'out'): AirportFlight[] {
  const end = dir === 'in' ? 'to' : 'from'
  return (model.data.flights ?? []).filter((f) => f[end] === iata)
}

/** The crawled flights on one directed airport pair, cheapest first as the data lists them. */
export function pairFlights(model: Model, from: string, to: string): AirportFlight[] {
  return (model.data.flights ?? []).filter((f) => f.from === from && f.to === to)
}

/** When a flight lands, by its local arrival hour: night before 06:00, day until 18:00, evening after. */
export function landing(arr: string | null): 'night' | 'day' | 'evening' | null {
  const h = arr && arr.length >= 16 ? Number(arr.slice(11, 13)) : NaN
  return Number.isNaN(h) ? null : h < 6 ? 'night' : h < 18 ? 'day' : 'evening'
}

export function countryName(model: Model, code: string): string {
  return model.data.countries.find((c) => c.code === code)?.name ?? code
}

/** "Managua, Nicaragua" when the place lies outside `home`, else just the name. */
export function placeLabel(model: Model, p: Place, home?: string): string {
  return p.country === home ? p.short_name : `${p.short_name}, ${countryName(model, p.country)}`
}

/** Neighbours grouped by country: `home` first, then the others by their fastest link. Order inside a group is kept. */
export function byCountry(list: Neighbour[], home: string): { country: string; list: Neighbour[] }[] {
  const groups = new Map<string, Neighbour[]>()
  for (const n of list) groups.set(n.other.country, [...(groups.get(n.other.country) ?? []), n])
  return [...groups]
    .map(([country, list]) => ({ country, list }))
    .sort((x, y) => Number(y.country === home) - Number(x.country === home) || fastest(x.list) - fastest(y.list))
}

const fastest = (l: Neighbour[]) => Math.min(...l.map((n) => n.fastest))

/** "Nicaragua to Honduras", or "Within Nicaragua" when both ends share a country. */
export function countries(model: Model, a: Place, b: Place): string {
  return a.country === b.country
    ? `Within ${countryName(model, a.country)}`
    : `${countryName(model, a.country)} to ${countryName(model, b.country)}`
}
