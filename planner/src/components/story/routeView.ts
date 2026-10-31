import { geoMercator, geoPath, geoTransform, type GeoPath, type GeoProjection, type GeoStream } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-50m.json'
import { bundle, entryOf, type BundledPlace, type RouteStop } from '../../lib/bundle'
import { countryName } from '../../lib/colors'

// Where everything sits on the summary map. The window keeps north up. The strip on top of a trip
// lies the map back and turns it so the route runs along the strip, a tall trip would be a sliver in
// a wide low box otherwise.

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
}
export interface RouteLand { at: (lon: number, lat: number) => Point; land: string; lit: string; borders: string }
export interface ViewStop extends RouteStop { x: number; y: number; fly: boolean }
export interface ViewPlace extends BundledPlace { id: string }
export interface ViewCountry {
  /** a country entered twice is two flags, so the code alone does not name one */
  key: string
  code: string
  name: string
  nights: string
  places: ViewPlace[]
  /** closed, moved just clear of its neighbours */
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
const TILT = 58 * Math.PI / 180
const DEPTH = 2200
/** The flat map is drawn this big and laid back around its middle. */
const FLAT = 1000

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

const lean = (x: number, y: number): Point => {
  const s = DEPTH / (DEPTH + (FLAT / 2 - y) * Math.sin(TILT))
  return [FLAT / 2 + (x - FLAT / 2) * s, FLAT / 2 + (y - FLAT / 2) * Math.cos(TILT) * s]
}

function tilted(stops: RouteStop[], c: Canvas) {
  const flat = geoMercator().angle(spinOf(stops)).fitExtent([[0, 0], [FLAT, FLAT]], reach(stops))
    // the near edge stops well before the eye, so the land behind you never flips over
    .clipExtent([[-3000, -3000], [4000, FLAT / 2 + 1500]])
  const pts = stops.map((s) => lean(...(flat([s.lon, s.lat]) as Point)))
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const box: Box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
  const pad = c.h > 300 ? 110 : 70
  const k = Math.min((c.w - pad * 2) / Math.max(box[2] - box[0], 1), (c.h - pad * 1.4) / Math.max(box[3] - box[1], 1))
  const dx = c.w / 2 - k * (box[0] + box[2]) / 2
  const dy = c.h * 0.56 - k * (box[1] + box[3]) / 2
  const place = (x: number, y: number): Point => {
    const [a, b] = lean(x, y)
    return [a * k + dx, b * k + dy]
  }
  const laid = geoTransform({
    point(this: { stream: GeoStream }, x: number, y: number) { this.stream.point(...place(x, y)) },
  })
  return {
    at: (lon: number, lat: number) => place(...(flat([lon, lat]) as Point)),
    stream: { stream: (s: GeoStream) => flat.stream(laid.stream(s)) },
  }
}

function drawn(path: GeoPath, stops: RouteStop[], at: RouteLand['at']): RouteLand {
  const names = new Set(stops.map((s) => countryName(s.country)))
  return {
    at,
    land: path(LAND) ?? '',
    lit: COUNTRIES.filter((f) => names.has(f.properties.name)).map((f) => path(f) ?? '').join(''),
    borders: path(BORDERS) ?? '',
  }
}

/** The land of a trip, kept apart from its layout so changing the nights does not redraw the world. */
export function routeLand(stops: RouteStop[], c: Canvas): RouteLand {
  if (c.tilted) {
    const { at, stream } = tilted(stops, c)
    return drawn(geoPath(stream).digits(1), stops, at)
  }
  const [top, side] = c.room ?? [0, 0]
  const proj: GeoProjection = geoMercator().fitExtent([[side, top], [c.w - side, c.h - 140]], reach(stops)).clipExtent([[0, 0], [c.w, c.h]])
  return drawn(geoPath(proj).digits(1), stops, (lon, lat) => proj([lon, lat]) as Point)
}

// Flags that would touch move just apart while they are closed.
function clear(list: ViewCountry[], c: Canvas) {
  for (let n = 0; n < 40; n++) {
    list.forEach((a, i) => list.slice(i + 1).forEach((b) => {
      const dx = b.rest[0] - a.rest[0]
      const dy = b.rest[1] - a.rest[1]
      const d = Math.hypot(dx, dy) || 1
      const push = (a.r * 2 + 8 - d) / 2
      if (push <= 0) return
      a.rest = [a.rest[0] - dx / d * push, a.rest[1] - dy / d * push]
      b.rest = [b.rest[0] + dx / d * push, b.rest[1] + dy / d * push]
    }))
    list.forEach((a) => {
      a.rest = [Math.min(c.w - a.r - 4, Math.max(a.r + 4, a.rest[0])), Math.min(c.h - a.r - 4, Math.max(a.r + 4, a.rest[1]))]
    })
  }
}

export function routeView(stops: RouteStop[], land: RouteLand, c: Canvas): RouteView {
  const r = c.tilted ? (c.h > 300 ? 38 : 22) : 30
  const placed = stops.map((s, i): ViewStop => {
    const [x, y] = land.at(s.lon, s.lat)
    return { ...s, x, y, fly: i > 0 && s.mode === 'flight' && s.country !== stops[i - 1].country }
  })
  const countries = bundle(stops).map((b, ci): ViewCountry => {
    const places = b.places.map((p, pi) => ({ ...p, id: `${ci}.${pi}` }))
    const first = placed[entryOf(places[0])]
    return {
      key: `${b.code}-${ci}`, code: b.code, name: countryName(b.code), nights: nightWord(b.nights), places,
      rest: [first.x, first.y], out: [first.x, first.y], r, ro: 18,
    }
  })
  clear(countries, c)
  const a = placed[0]
  const b = placed[placed.length - 1]
  // Copenhagen is off the map: the end further right leaves up to the right, the other up to the left
  const rightFirst = a.x >= b.x
  const end = (s: ViewStop, right: boolean): Point => c.tilted
    ? [s.x + (right ? 46 : -46), Math.max(6, s.y - 62)]
    : [Math.min(c.w - 270, Math.max(40, s.x + (right ? 60 : -60))), Math.max(200, s.y - 150)]
  return { ...c, stops: placed, countries, from: end(a, rightFirst), to: end(b, !rightFirst) }
}
