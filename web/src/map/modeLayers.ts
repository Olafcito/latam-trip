// The map's two modes as layers: Gyms and Experiences. Each mode has its own sources and stays hidden until
// switched on, and then everything else on the map goes. The building of the features is pure and tested.
import type { CircleLayerSpecification, ExpressionSpecification, GeoJSONSource, Map as MLMap, SymbolLayerSpecification } from 'maplibre-gl'
import { MID_SCORE, TOP_SCORE, cityName, totalOf, type ScoreTier } from '../data/gyms'
import type { SavedEntry } from '../data/experiences'
import type { CityRow, Experience, GymRow, Place } from '../data/types'
import type { LonLat } from '../lib/geo'
import { BOOKMARK, GLOVE } from './icons'
import { DASH_HI, HIT_OVERLAND, HIT_PLACES, HIT_ROUTES, LABEL_LAYERS, SAVED_LAYER, TRIP_LINE_LAYERS, TRIP_OVERLAND, VIA_LAYER } from './layers'
import { C, FONT, FONT_BOLD } from './style'

export type MapMode = 'gyms' | 'experiences'

/** What a tap on a marker found. A cluster carries what it takes to zoom in on it. */
export type ModeHit =
  | { kind: 'gym' | 'city' | 'experience' | 'place'; id: string }
  | { kind: 'cluster'; source: string; id: number; at: LonLat }

export const GYM_SOURCE = 'mode-gyms'
export const CITY_SOURCE = 'mode-cities'
export const EXP_SOURCE = 'mode-exps'
const SEL_SOURCE = 'mode-sel'

export const SCORE_COLOUR: Record<ScoreTier, string> = { top: C.bus, mid: C.flight, low: C.muted, none: '#5F7785' }

const NEUTRAL_CLUSTER = '#2C4452'
/** The city diamond sits this far above its spot, clear of the cluster of its own gyms. */
const CITY_RISE = 22
const CITY_SIZE = 0.62
const CITY_FAR = 0.36
const CITY_TEXT = 11.5
/** How far from a marker a tap still counts, so a fingertip does not have to land on a small dot. */
const TOUCH = 8

type Expr = ExpressionSpecification

/** The outline of a city diamond, heavier on the open one. It shrinks with the diamond, or it fills the icon's square. */
const cityHalo = (open: string | null): Expr => {
  const width = (normal: number, heavy: number): Expr | number => (open ? ['case', ['==', ['get', 'id'], open], heavy, normal] : normal)
  return ['interpolate', ['linear'], ['zoom'], 3, width(1, 1.6), 6, width(2, 3.5)]
}

const tierColour = (value: Expr): Expr => ['step', value, SCORE_COLOUR.none, 0, SCORE_COLOUR.low, MID_SCORE, SCORE_COLOUR.mid, TOP_SCORE, SCORE_COLOUR.top]
const isCluster: Expr = ['has', 'point_count']
const notCluster: Expr = ['!', isCluster]

type Point = GeoJSON.Feature<GeoJSON.Point>
const point = (at: LonLat, properties: Record<string, unknown>): Point => ({ type: 'Feature', properties, geometry: { type: 'Point', coordinates: at } })
const collection = (features: Point[]): GeoJSON.FeatureCollection<GeoJSON.Point> => ({ type: 'FeatureCollection', features })

/** Gyms with a known place on the map. `total` is -1 without a score, because a map expression cannot compare null. */
export function gymFeatures(gyms: GymRow[], at: Map<string, LonLat>) {
  return collection(
    gyms.flatMap((g) => {
      const spot = at.get(g.id)
      return spot ? [point(spot, { kind: 'gym', id: g.id, name: g.name, total: totalOf(g) ?? -1 })] : []
    }),
  )
}

export function cityFeatures(cities: CityRow[]) {
  return collection(
    cities.flatMap((c) => {
      if (c.lat == null || c.lon == null) return []
      const total = totalOf(c)
      const name = cityName(c)
      return [point([c.lon, c.lat], { kind: 'city', id: c.id, label: total == null ? name : `${name} ${total.toFixed(1)}`, total: total ?? -1 })]
    }),
  )
}

/** The experiences, and the saved places too, so the map agrees with the Saved group of the list. */
export function experienceFeatures(rows: Experience[], saved: SavedEntry[], places: Pick<Place, 'id' | 'lat' | 'lon'>[], at: Map<string, LonLat>) {
  const savedIds = new Set(saved.filter((s) => s.type === 'experience').map((s) => s.id))
  const placeById = new Map(places.map((p) => [p.id, p]))
  const experiences = rows.flatMap((e) => {
    const spot = at.get(e.id)
    return spot ? [point(spot, { kind: 'experience', id: e.id, name: e.name, saved: savedIds.has(e.id) })] : []
  })
  const savedPlaces = saved.flatMap((s) => {
    const p = s.type === 'place' ? placeById.get(s.id) : null
    return p ? [point([p.lon, p.lat], { kind: 'place', id: s.id, name: s.name, saved: true })] : []
  })
  return collection([...experiences, ...savedPlaces])
}

interface MarkerSpec {
  id: string
  source: string
  colour: Expr | string
  radius: Expr | number
  icon: string
  iconSize: Expr | number
  cluster: { fill: Expr | string; stroke: string; text: string }
  labelMinZoom: number
  /** Higher draws on top. */
  rank?: Expr
}

const clusterLayer = (s: MarkerSpec): CircleLayerSpecification => ({
  id: `${s.id}-cluster`,
  type: 'circle',
  source: s.source,
  filter: isCluster,
  layout: { visibility: 'none' },
  paint: {
    'circle-radius': ['step', ['get', 'point_count'], 14, 5, 18, 15, 22],
    'circle-color': s.cluster.fill,
    'circle-stroke-color': s.cluster.stroke,
    'circle-stroke-width': 1.5,
  },
})

const countLayer = (s: MarkerSpec): SymbolLayerSpecification => ({
  id: `${s.id}-count`,
  type: 'symbol',
  source: s.source,
  filter: isCluster,
  layout: {
    visibility: 'none',
    'text-field': ['get', 'point_count_abbreviated'],
    'text-font': FONT_BOLD,
    'text-size': 12,
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: { 'text-color': s.cluster.text },
})

const dotLayer = (s: MarkerSpec): CircleLayerSpecification => ({
  id: `${s.id}-dot`,
  type: 'circle',
  source: s.source,
  filter: notCluster,
  layout: { visibility: 'none', ...(s.rank ? { 'circle-sort-key': s.rank } : {}) },
  paint: { 'circle-radius': s.radius, 'circle-color': s.colour, 'circle-stroke-color': C.ground, 'circle-stroke-width': 1.5 },
})

const iconLayer = (s: MarkerSpec): SymbolLayerSpecification => ({
  id: `${s.id}-icon`,
  type: 'symbol',
  source: s.source,
  filter: notCluster,
  layout: {
    visibility: 'none',
    'icon-image': s.icon,
    'icon-size': s.iconSize,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
    ...(s.rank ? { 'symbol-sort-key': s.rank } : {}),
  },
})

const labelText = (field: string, font: string[], size: number, offset: number): SymbolLayerSpecification['layout'] => ({
  visibility: 'none',
  'text-field': ['get', field],
  'text-font': font,
  'text-size': size,
  'text-variable-anchor': ['right', 'left', 'top', 'bottom'],
  'text-radial-offset': offset,
  'text-justify': 'auto',
  'text-max-width': 9,
  'text-padding': 3,
})

const LABEL_PAINT = { 'text-color': C.text, 'text-halo-color': C.ground, 'text-halo-width': 1.4, 'text-halo-blur': 0.4 }

const labelLayer = (s: MarkerSpec): SymbolLayerSpecification => ({
  id: `${s.id}-label`,
  type: 'symbol',
  source: s.source,
  minzoom: s.labelMinZoom,
  filter: notCluster,
  layout: labelText('name', FONT, 11, 1.5),
  paint: LABEL_PAINT,
})

const GYMS: MarkerSpec = {
  id: 'gyms',
  source: GYM_SOURCE,
  colour: tierColour(['get', 'total']),
  radius: ['interpolate', ['linear'], ['get', 'total'], 0, 10, 8, 15],
  icon: 'glove',
  iconSize: ['interpolate', ['linear'], ['get', 'total'], 0, 0.62, 8, 0.85],
  cluster: { fill: tierColour(['get', 'best']), stroke: C.ground, text: C.ink },
  labelMinZoom: 8,
}

const SAVED_RANK: Expr = ['case', ['get', 'saved'], 1, 0]

const EXPERIENCES: MarkerSpec = {
  id: 'exps',
  source: EXP_SOURCE,
  colour: ['case', ['get', 'saved'], C.flight, C.text],
  radius: 11,
  icon: 'bookmark',
  iconSize: 0.62,
  cluster: { fill: NEUTRAL_CLUSTER, stroke: C.muted, text: C.text },
  labelMinZoom: 9,
  rank: SAVED_RANK,
}

const CITY_MARK = 'city-mark'
const CITY_LABEL = 'city-label'
const SEL_LAYER = 'mode-sel'

const layersOf = (s: MarkerSpec) => [clusterLayer(s), countLayer(s), dotLayer(s), iconLayer(s), labelLayer(s)]
const idsOf = (s: MarkerSpec) => layersOf(s).map((l) => l.id)

const MODE_LAYERS: Record<MapMode, string[]> = {
  gyms: [...idsOf(GYMS), CITY_MARK, CITY_LABEL],
  experiences: idsOf(EXPERIENCES),
}
const MARKS: Record<MapMode, string[]> = {
  gyms: [CITY_MARK, 'gyms-cluster', 'gyms-dot'],
  experiences: ['exps-cluster', 'exps-dot'],
}
const LABELS: Record<MapMode, string[]> = { gyms: [CITY_LABEL, 'gyms-label'], experiences: ['exps-label'] }

/** What a mode hides. The route families stay out of this: the selection effect owns them. */
const NORMAL_LAYERS = [
  VIA_LAYER, HIT_ROUTES, ...TRIP_LINE_LAYERS, TRIP_OVERLAND, HIT_OVERLAND, 'mover-glow', 'mover', 'place-ring', 'place-dot', DASH_HI, 'place-air',
  HIT_PLACES, SAVED_LAYER, 'stop-dot', 'trip-stop', 'trip-num', LABEL_LAYERS.town, LABEL_LAYERS.dest, 'stop-label', LABEL_LAYERS.focus,
]

function paintImage(draw: (g: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 72
  const g = canvas.getContext('2d')!
  g.scale(3, 3)
  draw(g)
  return g.getImageData(0, 0, 72, 72)
}

/** The marker icons, drawn from the same paths as the buttons. Goes first: the normal map uses the saved bookmark too. */
export function addMarkerImages(map: MLMap) {
  const glove = paintImage((g) => {
    g.fillStyle = C.ink
    g.fill(new Path2D(GLOVE.body))
    g.fill(new Path2D(GLOVE.cuff))
    g.globalCompositeOperation = 'destination-out'
    g.lineWidth = 1.7
    g.lineCap = 'round'
    g.stroke(new Path2D(GLOVE.thumb))
  })
  const bookmark = paintImage((g) => {
    g.fillStyle = C.ink
    g.fill(new Path2D(BOOKMARK))
  })
  const badge = paintImage((g) => {
    const path = new Path2D(BOOKMARK)
    g.strokeStyle = C.ground
    g.lineWidth = 4
    g.lineJoin = 'round'
    g.stroke(path)
    g.fillStyle = C.flight
    g.fill(path)
  })
  map.addImage('glove', glove, { pixelRatio: 3 })
  map.addImage('bookmark', bookmark, { pixelRatio: 3 })
  map.addImage('bookmark-saved', badge, { pixelRatio: 3 })
}

const EMPTY = collection([])

/** The sources and layers of both modes, hidden. After addRouteLayers, which registers the diamond. */
export function addModeLayers(map: MLMap) {
  const clustered = { cluster: true, clusterRadius: 36, clusterMaxZoom: 10 }
  map.addSource(GYM_SOURCE, { type: 'geojson', data: EMPTY, ...clustered, clusterProperties: { best: ['max', ['get', 'total']] } })
  map.addSource(EXP_SOURCE, { type: 'geojson', data: EMPTY, ...clustered })
  map.addSource(CITY_SOURCE, { type: 'geojson', data: EMPTY })
  map.addSource(SEL_SOURCE, { type: 'geojson', data: EMPTY })

  for (const layer of [...layersOf(GYMS), ...layersOf(EXPERIENCES)]) map.addLayer(layer)
  map.addLayer({
    id: CITY_LABEL,
    type: 'symbol',
    source: CITY_SOURCE,
    layout: {
      visibility: 'none',
      'text-field': ['get', 'label'],
      'text-font': FONT_BOLD,
      'text-size': CITY_TEXT,
      'text-anchor': 'bottom',
      'text-offset': [0, -(CITY_RISE + 11) / CITY_TEXT],
      'text-max-width': 12,
      'text-padding': 2,
    },
    paint: LABEL_PAINT,
  })
  map.addLayer({
    id: CITY_MARK,
    type: 'symbol',
    source: CITY_SOURCE,
    layout: {
      visibility: 'none',
      'icon-image': 'diamond',
      // far out the cities of Central America stand shoulder to shoulder, so they shrink. The rise stays the same
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, CITY_FAR, 6, CITY_SIZE],
      'icon-offset': ['interpolate', ['linear'], ['zoom'], 3, ['literal', [0, -CITY_RISE / CITY_FAR]], 6, ['literal', [0, -CITY_RISE / CITY_SIZE]]],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: { 'icon-color': C.text, 'icon-halo-color': tierColour(['get', 'total']), 'icon-halo-width': cityHalo(null) },
  })
  map.addLayer({
    id: SEL_LAYER,
    type: 'circle',
    source: SEL_SOURCE,
    paint: { 'circle-radius': 19, 'circle-color': 'rgba(0,0,0,0)', 'circle-stroke-color': C.text, 'circle-stroke-width': 2 },
  })
}

const show = (on: boolean) => (on ? 'visible' : 'none')

/** Switch a mode on, or back to the normal map with null. */
export function setMapMode(map: MLMap, mode: MapMode | null) {
  for (const id of NORMAL_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', show(!mode))
  for (const m of ['gyms', 'experiences'] as const) for (const id of MODE_LAYERS[m]) map.setLayoutProperty(id, 'visibility', show(mode === m))
}

export function setModeData(map: MLMap, source: string, data: GeoJSON.FeatureCollection) {
  ;(map.getSource(source) as GeoJSONSource | undefined)?.setData(data)
}

/** Rings the open card's marker. A city has no ring, its diamond grows a heavier outline instead. */
export function setModeSelection(map: MLMap, at: LonLat | null, cityId: string | null) {
  setModeData(map, SEL_SOURCE, collection(at ? [point(at, {})] : []))
  map.setPaintProperty(CITY_MARK, 'icon-halo-width', cityHalo(cityId))
}

/** The part of a rendered feature a hit needs. */
export interface HitFeature {
  layer: { id: string }
  source: string
  properties: Record<string, unknown>
  geometry: GeoJSON.Geometry
}

type Pixel = { x: number; y: number }

function hitOf(f: HitFeature): ModeHit | null {
  const p = f.properties
  if (typeof p.cluster_id === 'number') {
    return f.geometry.type === 'Point' ? { kind: 'cluster', source: f.source, id: p.cluster_id, at: f.geometry.coordinates as LonLat } : null
  }
  return p.kind && p.id ? ({ kind: p.kind, id: p.id } as ModeHit) : null
}

/** The marker whose centre is closest to the tap. A tap between two markers should take the one it was aimed at. */
export function nearestHit(features: HitFeature[], tap: Pixel, project: (at: LonLat) => Pixel): ModeHit | null {
  let best: ModeHit | null = null
  let bestDist = Infinity
  for (const f of features) {
    if (f.geometry.type !== 'Point') continue
    const hit = hitOf(f)
    if (!hit) continue
    const at = project(f.geometry.coordinates as LonLat)
    const dist = Math.hypot(at.x - tap.x, at.y - (f.layer.id === CITY_MARK ? CITY_RISE : 0) - tap.y)
    if (dist < bestDist) {
      best = hit
      bestDist = dist
    }
  }
  return best
}

/** What the pointer is on: a marker within reach of a fingertip, or else a label right under it. */
export function modeHit(map: MLMap, tap: Pixel, mode: MapMode): ModeHit | null {
  const marks = map.queryRenderedFeatures(
    [
      [tap.x - TOUCH, tap.y - TOUCH],
      [tap.x + TOUCH, tap.y + TOUCH],
    ],
    { layers: MARKS[mode] },
  )
  const hit = nearestHit(marks, tap, (at) => map.project(at))
  if (hit) return hit
  const label = map.queryRenderedFeatures([tap.x, tap.y], { layers: LABELS[mode] })[0]
  return label ? hitOf(label) : null
}
