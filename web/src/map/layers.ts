import type {
  CircleLayerSpecification,
  ExpressionSpecification,
  LineLayerSpecification,
  Map as MLMap,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import type { Model } from '../data/model'
import type { Family } from '../data/types'
import { C, FONT, FONT_BOLD } from './style'

/** A filter that matches nothing. Written as an expression so it is not parsed as a legacy filter. */
const NONE: ExpressionSpecification = ['boolean', false]

const fs = (key: string): ExpressionSpecification => ['boolean', ['feature-state', key], false]
const HL = fs('hl')

export const ROUTE_LAYERS: Record<Family, string> = { ground: 'route-ground', boat: 'route-boat', flight: 'route-flight' }
export const HIT_ROUTES = 'route-hit'
export const HIT_PLACES = 'place-hit'
export const LABEL_LAYERS = { focus: 'label-focus', dest: 'label-dest', town: 'label-town' }
export const TRIP_LINE_LAYERS = ['trip-casing', 'trip-line', 'trip-flight']
export const TRIP_OVERLAND = 'trip-overland'
export const HIT_OVERLAND = 'trip-overland-hit'

export const VIA_LAYER = 'route-via'

/** Overview routes are faint. A flight in focus that only flies via layovers hides its direct arc for its via path. Hovering a city previews its routes, and a selection shows only its own. */
export function routeOpacity(base: number): ExpressionSpecification {
  return ['case', fs('via'), 0, HL, 1, fs('calm'), 0.4, fs('show'), 0.95, fs('pv'), 0.85, base]
}

const routeWidth: ExpressionSpecification = [
  'interpolate', ['linear'], ['zoom'],
  3, ['case', HL, 2.2, 1.2],
  8, ['case', HL, 2.5, 1.8],
]

function routeLayer(family: Family, color: string, dash?: number[]): LineLayerSpecification {
  return {
    id: ROUTE_LAYERS[family],
    type: 'line',
    source: 'routes',
    filter: ['==', ['get', 'family'], family],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': color,
      'line-width': routeWidth,
      'line-opacity': routeOpacity(0.25),
      'line-offset': ['*', ['get', 'side'], 1.25],
      ...(dash ? { 'line-dasharray': dash } : {}),
    },
  }
}

const near = fs('near')
const sel = fs('sel')
const hot = fs('hot')
const lit: ExpressionSpecification = ['any', sel, hot, near]
const DIM = 0.45
const QUIET = 0.12
/** Towns and stop-only places fade in from zoom 5.5 to 6.5 unless they belong to the selection; the rest dims beside one. */
const placeFade = (dim: number): ExpressionSpecification => [
  'interpolate', ['linear'], ['zoom'],
  5.5, ['case', lit, 1, ['==', ['get', 'tier'], 'destination'], ['case', fs('dim'), dim, 1], 0],
  6.5, ['case', lit, 1, fs('dim'), dim, 1],
]
const airFade = (dim: number): ExpressionSpecification => ['case', lit, 1, fs('dim'), dim, 1]
const tier = (dest: number, town: number, stop: number): ExpressionSpecification =>
  ['match', ['get', 'tier'], 'destination', dest, 'town', town, stop]

const labelPaint = {
  'text-color': ['case', sel, C.flight, ['any', hot, near], '#FFFFFF', '#C6D3D9'] as ExpressionSpecification,
  'text-halo-color': C.ground,
  'text-halo-width': 1.4,
  'text-halo-blur': 0.4,
  // a stop on the route in focus is named by the stop label instead
  'text-opacity': ['case', fs('stop'), 0, 1] as ExpressionSpecification,
}

function label(id: string, fontStack: string[], size: number, extra: Partial<SymbolLayerSpecification> = {}): SymbolLayerSpecification {
  return {
    id,
    type: 'symbol',
    source: 'places',
    layout: {
      'text-field': ['get', 'short_name'],
      'text-font': fontStack,
      'text-size': size,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      // airports are diamonds, a little wider than a dot
      'text-radial-offset': ['case', ['get', 'hub'], 1.05, ['get', 'airport'], 0.9, 0.75],
      'text-justify': 'auto',
      'text-padding': 3,
      // flight hubs are labelled before the places around them, lower keys place first
      'symbol-sort-key': ['-', ['get', 'popularity'], ['case', ['get', 'hub'], 3, 0]],
    },
    paint: labelPaint,
    ...extra,
  }
}

export function addRouteLayers(map: MLMap, model: Model) {
  const countries: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: model.data.countries.map((c) => ({
      type: 'Feature',
      properties: { name: c.name, code: c.code },
      geometry: { type: 'Point', coordinates: [c.label_lon, c.label_lat] },
    })),
  }
  const places: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: model.places.map((p) => ({
      type: 'Feature',
      properties: { id: p.id, short_name: p.short_name, tier: p.tier, popularity: p.popularity, hub: !!p.hub, airport: p.iata === p.id },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  }
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  map.addSource('countries', { type: 'geojson', data: countries })
  map.addSource('routes', { type: 'geojson', data: model.routes, promoteId: 'fid', tolerance: 0.2 })
  map.addSource('places', { type: 'geojson', data: places, promoteId: 'id' })
  map.addSource('stops', { type: 'geojson', data: empty })
  map.addSource('via', { type: 'geojson', data: empty })
  map.addSource('mover', { type: 'geojson', data: empty })
  map.addSource('trip', { type: 'geojson', data: empty })
  map.addSource('trip-stops', { type: 'geojson', data: empty })
  map.addImage('diamond', diamondSdf(), { sdf: true })

  map.addLayer({
    id: 'country-label',
    type: 'symbol',
    source: 'countries',
    layout: {
      'text-field': ['upcase', ['get', 'name']],
      'text-font': FONT,
      'text-size': ['interpolate', ['linear'], ['zoom'], 3, 10, 7, 13],
      'text-letter-spacing': 0.32,
      'text-variable-anchor': ['center', 'top', 'bottom'],
      'text-radial-offset': 1.2,
      'text-padding': 8,
      'text-max-width': 20,
    },
    paint: { 'text-color': C.country, 'text-halo-color': C.land, 'text-halo-width': 1 },
  })

  map.addLayer(routeLayer('ground', C.bus))
  map.addLayer(routeLayer('boat', C.boat, [2.5, 2]))
  map.addLayer(routeLayer('flight', C.flight, [0, 2.2]))
  // the flight in focus, drawn through its layovers
  map.addLayer({
    id: VIA_LAYER,
    type: 'line',
    source: 'via',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': C.flight,
      'line-width': ['interpolate', ['linear'], ['zoom'], 3, 2.2, 8, 2.5],
      'line-dasharray': [0, 2.2],
    },
  })
  map.addLayer({
    id: HIT_ROUTES,
    type: 'line',
    source: 'routes',
    filter: NONE,
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 },
  })

  // the open trip: a cased line per leg, drawn over the faint network
  map.addLayer({
    id: 'trip-casing',
    type: 'line',
    source: 'trip',
    filter: ['!=', ['get', 'family'], 'overland'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': C.ground, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 6.5, 8, 8.5], 'line-opacity': 0.85 },
  })
  map.addLayer({
    id: 'trip-line',
    type: 'line',
    source: 'trip',
    filter: ['!', ['in', ['get', 'family'], ['literal', ['flight', 'overland']]]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['match', ['get', 'family'], 'boat', C.boat, C.bus], 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 4] },
  })
  map.addLayer({
    id: 'trip-flight',
    type: 'line',
    source: 'trip',
    filter: ['==', ['get', 'family'], 'flight'],
    layout: { 'line-join': 'round' },
    paint: { 'line-color': C.flight, 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 3, 8, 4], 'line-dasharray': [1.6, 1.1] },
  })
  // overland blocks of a seeded trip: your own route, so only a faint dashed line between the ends
  map.addLayer({
    id: TRIP_OVERLAND,
    type: 'line',
    source: 'trip',
    filter: ['==', ['get', 'family'], 'overland'],
    paint: { 'line-color': C.text, 'line-opacity': 0.55, 'line-width': 1.6, 'line-dasharray': [2, 2.4] },
  })
  map.addLayer({
    id: HIT_OVERLAND,
    type: 'line',
    source: 'trip',
    filter: ['==', ['get', 'family'], 'overland'],
    paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 14 },
  })

  map.addLayer({
    id: 'mover-glow',
    type: 'circle',
    source: 'mover',
    paint: { 'circle-radius': 7, 'circle-color': ['get', 'color'], 'circle-opacity': 0.25, 'circle-blur': 0.8 },
  })
  map.addLayer({
    id: 'mover',
    type: 'circle',
    source: 'mover',
    paint: { 'circle-radius': 3, 'circle-color': ['get', 'core'] },
  })

  const fadeIn = placeFade(DIM)
  // Places without an airport are small dots, so the airport diamonds stand out.
  const dot: CircleLayerSpecification = {
    id: 'place-dot',
    type: 'circle',
    source: 'places',
    filter: ['!', ['get', 'airport']],
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3, ['*', tier(3.2, 2.2, 1.9), ['case', hot, 1.6, sel, 1.5, near, 1.25, 1]],
        8, ['*', tier(5, 3.8, 3.2), ['case', hot, 1.6, sel, 1.5, near, 1.25, 1]],
      ],
      'circle-color': ['case', ['any', sel, hot], C.flight, near, '#FFFFFF', ['==', ['get', 'tier'], 'destination'], C.dot, C.muted],
      'circle-opacity': fadeIn,
      'circle-stroke-color': C.ground,
      'circle-stroke-width': 2,
      'circle-stroke-opacity': fadeIn,
    },
  }
  map.addLayer({
    id: 'place-ring',
    type: 'circle',
    source: 'places',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 11, 8, 14],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': C.flight,
      'circle-stroke-width': 1.5,
      'circle-stroke-opacity': ['case', sel, 0.8, 0],
    },
  })
  map.addLayer(dot)
  // airports: amber diamonds, filled for flight hubs and outlined for the rest. Always shown.
  map.addLayer({
    id: 'place-air',
    type: 'symbol',
    source: 'places',
    filter: ['get', 'airport'],
    layout: {
      'icon-image': 'diamond',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['get', 'hub'], 0.5, 0.38], 8, ['case', ['get', 'hub'], 0.68, 0.52]],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
    paint: {
      'icon-color': ['case', ['any', sel, hot], '#FFFFFF', ['get', 'hub'], C.flight, C.ground],
      'icon-halo-color': ['case', ['any', sel, hot], C.flight, ['get', 'hub'], C.ground, C.flight],
      'icon-halo-width': ['case', ['get', 'hub'], 1.5, 1.7],
      'icon-opacity': airFade(DIM),
    },
  })
  map.addLayer({
    id: HIT_PLACES,
    type: 'circle',
    source: 'places',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, tier(10, 6, 5), 8, 13],
      'circle-color': '#000',
      'circle-opacity': 0,
    },
  })

  // stops on the highlighted route, at their real coordinates
  map.addLayer({
    id: 'stop-dot',
    type: 'circle',
    source: 'stops',
    paint: {
      'circle-radius': ['match', ['get', 'type'], 'border', 4.5, 5],
      'circle-color': ['match', ['get', 'type'], 'change', C.bus, 'layover', C.flight, 'border', C.flight, C.ground],
      'circle-stroke-color': ['match', ['get', 'type'], 'border', C.ground, ['get', 'color']],
      'circle-stroke-width': 2,
    },
  })

  // numbered stops of the open trip, the last one amber
  map.addLayer({
    id: 'trip-stop',
    type: 'circle',
    source: 'trip-stops',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, ['case', ['get', 'end'], 8.5, 7], 8, ['case', ['get', 'end'], 10, 8.5]],
      'circle-color': ['case', ['get', 'end'], C.flight, '#FFFFFF'],
      'circle-stroke-color': C.ground,
      'circle-stroke-width': 2,
    },
  })
  map.addLayer({
    id: 'trip-num',
    type: 'symbol',
    source: 'trip-stops',
    layout: {
      'text-field': ['get', 'n'],
      'text-font': FONT_BOLD,
      'text-size': 10,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': C.ground },
  })

  map.addLayer(label(LABEL_LAYERS.town, FONT, 11, { minzoom: 7, filter: ['!=', ['get', 'tier'], 'destination'] }))
  map.addLayer(label(LABEL_LAYERS.dest, FONT_BOLD, 12.5, { filter: ['==', ['get', 'tier'], 'destination'] }))
  map.addLayer({
    id: 'stop-label',
    type: 'symbol',
    source: 'stops',
    layout: {
      'text-field': ['format', ['get', 'name'], {}, '  ' as never, {}, ['get', 'kind'], { 'text-color': C.flight, 'font-scale': 0.85 }],
      'text-font': FONT_BOLD,
      'text-size': 11.5,
      'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
      'text-radial-offset': 0.9,
      'text-justify': 'auto',
      'text-allow-overlap': true,
    },
    paint: { 'text-color': C.text, 'text-halo-color': C.ground, 'text-halo-width': 1.6 },
  })
  // the selected city and its neighbours: placed first, so they win every collision
  map.addLayer(label(LABEL_LAYERS.focus, FONT_BOLD, 13, { filter: NONE }))
}

/**
 * A diamond as a signed distance field, so one image takes any fill and outline colour.
 * MapLibre reads alpha 0.75 as the edge and one pixel of distance as 1/8 of alpha.
 */
function diamondSdf(r = 16, buffer = 8) {
  const n = 2 * (r + buffer)
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const d = (Math.abs(x + 0.5 - n / 2) + Math.abs(y + 0.5 - n / 2) - r) / Math.SQRT2
      const i = (y * n + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 255
      data[i + 3] = Math.round(255 * Math.min(1, Math.max(0, 0.75 - d / 8)))
    }
  }
  return { width: n, height: n, data }
}

const inIds = (ids: string[]): ExpressionSpecification => ['in', ['get', 'id'], ['literal', ids]]

/**
 * Point the label layers at a new focus set (the selected city and its neighbours). The selected
 * label is placed first. With `only`, every other label goes: the map shows just the focus set.
 */
export function setLabelFocus(map: MLMap, ids: string[], sel: string | null = null, only = false) {
  map.setFilter(LABEL_LAYERS.focus, ids.length ? inIds(ids) : NONE)
  map.setLayoutProperty(LABEL_LAYERS.focus, 'symbol-sort-key', ['case', ['==', ['get', 'id'], sel ?? ''], -1, ['get', 'popularity']])
  map.setFilter(LABEL_LAYERS.dest, only ? NONE : ['all', ['==', ['get', 'tier'], 'destination'], ['!', inIds(ids)]])
  map.setFilter(LABEL_LAYERS.town, only ? NONE : ['all', ['!=', ['get', 'tier'], 'destination'], ['!', inIds(ids)]])
}

/** How far places outside the focus set fade: the overview keeps them readable, build mode nearly hides them. */
export function setQuiet(map: MLMap, quiet: boolean) {
  const dim = quiet ? QUIET : DIM
  map.setPaintProperty('place-dot', 'circle-opacity', placeFade(dim))
  map.setPaintProperty('place-dot', 'circle-stroke-opacity', placeFade(dim))
  map.setPaintProperty('place-air', 'icon-opacity', airFade(dim))
}

/** Routes of enabled families take pointer events. With a selection, only the selected city's routes do (null means all). */
export function setRouteHit(map: MLMap, cids: string[] | null, families: Family[]) {
  const fam: ExpressionSpecification = ['in', ['get', 'family'], ['literal', families]]
  if (!cids) return map.setFilter(HIT_ROUTES, fam)
  map.setFilter(HIT_ROUTES, cids.length ? ['all', ['in', ['get', 'cid'], ['literal', cids]], fam] : NONE)
}
