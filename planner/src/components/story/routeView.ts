import { geoInterpolate, geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-50m.json'
import { bundle, entryOf, type BundledPlace, type RouteStop } from '../../lib/bundle'
import { countryName } from '../../lib/colors'
import { clusterOf, insetFor } from './routeInset'

// Where everything sits on the summary map. The window keeps north up. The strip on top of a trip
// turns the same flat map so the route runs along the strip, a tall trip would be a sliver in a wide
// low box otherwise. A crowd of countries too close to read is drawn again, bigger, in free room.

export type Point = [number, number]
export type Box = [number, number, number, number]

export interface Canvas {
  w: number
  h: number
  tilted: boolean
  /** a window keeps this much free above the route and beside it */
  room?: Point
  /** flags alone, too narrow for their words */
  bare?: boolean
  /** a window keeps this much free below the route, for the bar laid over it */
  foot?: number
  /** the radius of the flag of the longest stay */
  flag?: number
}
export interface Lit { code: string; d: string }
export interface RouteInset {
  /** where it is drawn */
  rect: Box
  /** where its countries really are on the map */
  spot: Box
  k: number
  codes: string[]
  land: string
  lit: Lit[]
  borders: string
}
export interface RouteLand {
  /** a stop of a country in the inset sits in the inset */
  at: (lon: number, lat: number, code?: string) => Point
  land: string
  lit: Lit[]
  borders: string
  inset?: RouteInset
}
export interface ViewStop extends RouteStop {
  x: number
  y: number
  fly: boolean
  /** which way the flight into it bends, 1 the usual way */
  side: 1 | -1
}
export interface ViewPlace extends BundledPlace { id: string }
export interface ViewCountry {
  /** a country entered twice is two flags, so the code alone does not name one */
  key: string
  code: string
  name: string
  nights: string
  /** the nights as a number, for the bar and the sizes */
  n: number
  /** its first and last stop, as indexes into the trip's stops */
  first: number
  last: number
  places: ViewPlace[]
  /** closed, on the first place you reach */
  rest: Point
  /** open, on the first place you reach */
  out: Point
  r: number
  ro: number
}
export interface RouteView extends Canvas { stops: ViewStop[]; countries: ViewCountry[]; from: Point; to: Point }

const topo = world as unknown as Topology<{ countries: GeometryCollection<{ name: string }>; land: GeometryCollection }>
const LAND = feature(topo, topo.objects.land)
const COUNTRIES = feature(topo, topo.objects.countries).features
const BORDERS = mesh(topo, topo.objects.countries, (a, b) => a !== b)

/** A small trip keeps this many degrees of land either side of its middle. */
const MIN_SPAN = 3
/** The flat map the strip's turn is worked out on. */
const FLAT = 1000
/** Countries whose flags sit nearer than this many of the biggest flag's radius crowd. */
const CROWD = 2.6
/** How far the line to home runs before it leaves the map, in the window and in the strip. */
const STUB = 150
const STUB_STRIP = 60
/** Home when the trip does not say, Copenhagen. */
const HOME: Point = [12.6, 55.6]

/** A country only passed through gets a flag this much smaller open, and a small mark closed. */
const PASS = 0.55
const MARK = 0.34
/** The shortest stay still gets this share of the longest one's flag, so it stays a flag you can tap. */
const LEAST = 0.42
const OPEN = 18

/** A flag's area goes with its nights against the longest stay. */
export function flagSize(nights: number, longest: number, base: number): number {
  if (!nights) return base * MARK
  return base * Math.max(LEAST, Math.sqrt(nights / Math.max(longest, 1)))
}

/**
 * Two flags that would touch: the smaller one shrinks first, never below least of its size. What still
 * touches then stacks, the smaller drawn on top.
 */
export function fitSizes(pts: Point[], rs: number[], gap = 6, least = 0.7): number[] {
  const out = [...rs]
  const order = rs.map((_, i) => i).sort((a, b) => rs[b] - rs[a])
  order.forEach((i, k) => order.slice(0, k).forEach((j) => {
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])
    if (d >= out[i] + out[j] + gap) return
    out[i] = Math.max(rs[i] * least, Math.min(out[i], d - out[j] - gap))
  }))
  return out
}

/** No flag is bigger than one with more nights, so the order of the sizes is the order of the stays. */
export function inOrder(rs: number[], ns: number[]): number[] {
  const out = [...rs]
  const order = ns.map((_, i) => i).sort((a, b) => ns[b] - ns[a])
  order.forEach((i) => order.forEach((j) => { if (ns[j] > ns[i]) out[i] = Math.min(out[i], out[j]) }))
  return out
}

/** How far a flight bends off the straight line. */
export const bendOf = (len: number, tilted: boolean) => (tilted ? Math.min(70, len * 0.3) : 88)

/** The control point of a flight from a to b bent to this side. */
export function bentAt(a: Point, b: Point, side: number, bend: number): Point {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy) || 1
  return [(a[0] + b[0]) / 2 + dy / len * bend * side, (a[1] + b[1]) / 2 - dx / len * bend * side]
}

/**
 * The side a flight bends to: the usual one unless it would run over a flag it does not join or along a
 * corridor another flight already bends through.
 */
export function sideOf(a: Point, b: Point, avoid: { p: Point; r: number }[], used: Point[], bend: number): 1 | -1 {
  const cost = (side: number) => {
    const c = bentAt(a, b, side, bend)
    let n = 0
    for (let k = 1; k < 16; k++) {
      const t = k / 16
      const u = 1 - t
      const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0]
      const y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]
      avoid.forEach(({ p, r }) => { if (Math.hypot(x - p[0], y - p[1]) < r + 8) n += 1 })
    }
    used.forEach((q) => { if (Math.hypot(q[0] - c[0], q[1] - c[1]) < bend * 0.9) n += 4 })
    return n
  }
  return cost(-1) < cost(1) ? -1 : 1
}

export const nightWord = (n: number) => (n ? `${n} ${n === 1 ? 'night' : 'nights'}` : 'Passing through')

function reach(stops: RouteStop[]) {
  const lons = stops.map((s) => s.lon)
  const lats = stops.map((s) => s.lat)
  const cx = (Math.min(...lons) + Math.max(...lons)) / 2
  const cy = (Math.min(...lats) + Math.max(...lats)) / 2
  const dx = Math.max(MIN_SPAN, (Math.max(...lons) - Math.min(...lons)) / 2)
  const dy = Math.max(MIN_SPAN, (Math.max(...lats) - Math.min(...lats)) / 2)
  return { type: 'MultiPoint' as const, coordinates: [[cx - dx, cy - dy], [cx + dx, cy + dy], ...stops.map((s) => [s.lon, s.lat])] }
}

/** The turn that lays the two stops furthest apart along the strip, with the west staying left. */
function spinOf(stops: RouteStop[]) {
  const plain = geoMercator().scale(FLAT)
  const pts = stops.map((s) => plain([s.lon, s.lat])!)
  let far = 0
  let turn = 0
  pts.forEach((a, i) => pts.slice(i + 1).forEach((b) => {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d <= far) return
    far = d
    turn = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI
  }))
  return turn > 90 ? turn - 180 : turn <= -90 ? turn + 180 : turn
}

const baseFlag = (c: Canvas) => c.flag ?? (c.tilted ? (c.h > 300 ? 38 : 22) : 34)

/** The first stop of each visit to a country, in order. */
const visits = (stops: RouteStop[]) => stops.filter((s, i) => !i || s.country !== stops[i - 1].country)

function drawn(path: (o: object) => string | null, codes: Set<string>) {
  const names = new Map([...codes].map((c) => [countryName(c), c]))
  return {
    land: path(LAND) ?? '',
    lit: COUNTRIES.filter((f) => names.has(f.properties.name)).map((f) => ({ code: names.get(f.properties.name)!, d: path(f) ?? '' })),
    borders: path(BORDERS) ?? '',
  }
}

/** The land of a trip, kept apart from its layout so changing the nights does not redraw the world. */
export function routeLand(stops: RouteStop[], c: Canvas): RouteLand {
  const [top, side] = c.room ?? [0, 0]
  const foot = c.foot ?? 140
  const pad = c.tilted ? (c.h > 300 ? 70 : 40) : 0
  const extent: [Point, Point] = c.tilted
    ? [[pad, pad * 0.6], [c.w - pad, c.h - pad * 0.6]]
    : [[side, top], [c.w - side, c.h - foot]]
  const proj: GeoProjection = geoMercator().angle(c.tilted ? spinOf(stops) : 0).fitExtent(extent, reach(stops))
    .clipExtent([[0, 0], [c.w, c.h]])
  const flat = (lon: number, lat: number) => proj([lon, lat]) as Point
  const base = drawn((o) => geoPath(proj).digits(1)(o as never), new Set(stops.map((s) => s.country)))

  // countries whose flags crowd each other are drawn again, bigger, in room the map leaves free
  const r = baseFlag(c)
  const firsts = visits(stops)
  const crowd = clusterOf(firsts.map((s) => flat(s.lon, s.lat)), r * CROWD)
  const codes = new Set(crowd.map((i) => firsts[i].country))
  const pts = stops.filter((s) => codes.has(s.country)).map((s) => flat(s.lon, s.lat))
  if (!pts.length) return { ...base, at: flat }

  const spot: Box = [
    Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])),
    Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1])),
  ]
  const room = r * 1.2
  const box: Box = [spot[0] - room, spot[1] - room, spot[2] + room, spot[3] + room]
  // the others keep room for their flag and its name, and for the line between them
  const rest = stops.filter((s) => !codes.has(s.country))
  const others = rest.map((s) => ({ p: flat(s.lon, s.lat), r: r * 1.6 }))
  rest.forEach((s, i) => {
    if (!i) return
    const a = flat(rest[i - 1].lon, rest[i - 1].lat)
    const b = flat(s.lon, s.lat)
    for (let k = 1; k < 8; k++) others.push({ p: [a[0] + (b[0] - a[0]) * k / 8, a[1] + (b[1] - a[1]) * k / 8], r: 10 })
  })
  const area: Box = c.tilted ? [8, 8, c.w - 8, c.h - 8] : [14, top, c.w - 14, c.h - foot]
  const got = insetFor(box, others, area)
  if (!got) return { ...base, at: flat }

  const { rect, k } = got
  const [tx, ty] = proj.translate()
  // the same map, k times bigger, with the crowd's box landing on the inset
  const big = geoMercator().angle(proj.angle()).scale(proj.scale() * k)
    .translate([k * tx + rect[0] - k * box[0], k * ty + rect[1] - k * box[1]])
    .clipExtent([[rect[0], rect[1]], [rect[2], rect[3]]])
  const there = drawn((o) => geoPath(big).digits(1)(o as never), codes)
  return {
    ...base,
    at: (lon, lat, code) => (code && codes.has(code) ? big([lon, lat]) as Point : flat(lon, lat)),
    inset: { rect, spot, k, codes: [...codes], ...there },
  }
}

export function routeView(stops: RouteStop[], land: RouteLand, c: Canvas, home: Point = HOME): RouteView {
  const r = baseFlag(c)
  const placed = stops.map((s, i): ViewStop => {
    const [x, y] = land.at(s.lon, s.lat, s.country)
    return { ...s, x, y, fly: i > 0 && s.mode === 'flight' && s.country !== stops[i - 1].country, side: 1 }
  })
  const bundled = bundle(stops)
  const longest = Math.max(...bundled.map((b) => b.nights), 1)
  const countries = bundled.map((b, ci): ViewCountry => {
    const places = b.places.map((p, pi) => ({ ...p, id: `${ci}.${pi}` }))
    const first = placed[entryOf(places[0])]
    return {
      key: `${b.code}-${ci}`, code: b.code, name: countryName(b.code), nights: nightWord(b.nights), n: b.nights,
      first: b.stops[0], last: b.stops[b.stops.length - 1], places,
      rest: [first.x, first.y], out: [first.x, first.y], r: flagSize(b.nights, longest, r), ro: OPEN * (b.nights ? 1 : PASS),
    }
  })
  // a flag stays on its place: close ones shrink the smaller first, then stack, and never outgrow a longer stay
  const sized = fitSizes(countries.map((x) => x.rest), countries.map((x) => x.r))
  inOrder(sized, countries.map((x) => x.n)).forEach((size, i) => { countries[i].r = size })

  // a flight bends clear of the flags it does not join and of a corridor another flight took
  const flagOf = (i: number) => countries.find((x) => i >= x.first && i <= x.last) ?? countries[0]
  const used: Point[] = []
  placed.forEach((s, i) => {
    if (!s.fly) return
    const fa = flagOf(i - 1)
    const fb = flagOf(i)
    const a = fa.rest
    const b = fb.rest
    const bend = bendOf(Math.hypot(b[0] - a[0], b[1] - a[1]), c.tilted)
    const avoid = countries.filter((x) => x !== fa && x !== fb).map((x) => ({ p: x.rest, r: x.r }))
    s.side = sideOf(a, b, avoid, used, bend)
    used.push(bentAt(a, b, s.side, bend))
  })

  // home is off the map: each end leaves along the great circle towards it
  const stub = c.tilted ? STUB_STRIP : STUB
  const edge = c.tilted ? 6 : 20
  const end = (s: ViewStop, flag: Point): Point => {
    const step = geoInterpolate([s.lon, s.lat], home)(0.02)
    const [hx, hy] = land.at(step[0], step[1], s.country)
    const len = Math.hypot(hx - s.x, hy - s.y) || 1
    return [
      Math.min(c.w - edge, Math.max(edge, flag[0] + (hx - s.x) / len * stub)),
      Math.min(c.h - edge, Math.max(edge, flag[1] + (hy - s.y) / len * stub)),
    ]
  }
  const from = end(placed[0], countries[0].rest)
  let to = end(placed[placed.length - 1], countries[countries.length - 1].rest)
  // a trip that starts and ends in one place keeps its two lines apart
  if (Math.hypot(to[0] - from[0], to[1] - from[1]) < 24) to = [Math.min(c.w - edge, to[0] + 28), to[1] + 16]
  return { ...c, stops: placed, countries, from, to }
}
