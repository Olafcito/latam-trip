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

/** Overview routes are faint. Hovering a city previews its routes, and a selection shows only its own. */
export function routeOpacity(base: number): ExpressionSpecification {
  return ['case', HL, 1, fs('calm'), 0.4, fs('show'), 0.95, fs('pv'), 0.85, base]
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
const tier = (dest: number, town: number, stop: number): ExpressionSpecification =>
  ['match', ['get', 'tier'], 'destination', dest, 'town', town, stop]

const labelPaint = {
  'text-color': ['case', sel, C.flight, ['any', hot, near], '#FFFFFF', '#C6D3D9'] as ExpressionSpecification,
  'text-halo-color': C.ground,
  'text-halo-width': 1.4,
  'text-halo-blur': 0.4,
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
      'text-radial-offset': 0.75,
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
      properties: { id: p.id, short_name: p.short_name, tier: p.tier, popularity: p.popularity, hub: !!p.hub },
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
    })),
  }
  const empty: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

  map.addSource('countries', { type: 'geojson', data: countries })
  map.addSource('routes', { type: 'geojson', data: model.routes, promoteId: 'fid', tolerance: 0.2 })
  map.addSource('places', { type: 'geojson', data: places, promoteId: 'id' })
  map.addSource('stops', { type: 'geojson', data: empty })
  map.addSource('mover', { type: 'geojson', data: empty })

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
  map.addLayer({
    id: HIT_ROUTES,
    type: 'line',
    source: 'routes',
    filter: NONE,
    layout: { 'line-cap': 'round' },
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

  const fadeIn = (from: number, to: number): ExpressionSpecification => [
    'interpolate', ['linear'], ['zoom'],
    from, ['case', lit, 1, ['==', ['get', 'tier'], 'destination'], ['case', fs('dim'), 0.45, 1], 0],
    to, ['case', lit, 1, fs('dim'), 0.45, 1],
  ]
  // towns and stop-only places fade in from zoom 5.5 to 6.5 unless they belong to the selection
  const dot: CircleLayerSpecification = {
    id: 'place-dot',
    type: 'circle',
    source: 'places',
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        3, ['*', tier(4, 2.6, 2.2), ['case', hot, 1.6, sel, 1.5, near, 1.25, 1]],
        8, ['*', tier(6, 4.5, 3.6), ['case', hot, 1.6, sel, 1.5, near, 1.25, 1]],
      ],
      'circle-color': ['case', ['any', sel, hot], C.flight, near, '#FFFFFF', ['==', ['get', 'tier'], 'destination'], C.dot, C.muted],
      'circle-opacity': fadeIn(5.5, 6.5),
      'circle-stroke-color': C.ground,
      'circle-stroke-width': 2,
      'circle-stroke-opacity': fadeIn(5.5, 6.5),
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

const inIds = (ids: string[]): ExpressionSpecification => ['in', ['get', 'id'], ['literal', ids]]

/** Point the label layers at a new focus set (the selected city and its neighbours). The selected label is placed first. */
export function setLabelFocus(map: MLMap, ids: string[], sel: string | null = null) {
  map.setFilter(LABEL_LAYERS.focus, ids.length ? inIds(ids) : NONE)
  map.setLayoutProperty(LABEL_LAYERS.focus, 'symbol-sort-key', ['case', ['==', ['get', 'id'], sel ?? ''], -1, ['get', 'popularity']])
  map.setFilter(LABEL_LAYERS.dest, ['all', ['==', ['get', 'tier'], 'destination'], ['!', inIds(ids)]])
  map.setFilter(LABEL_LAYERS.town, ['all', ['!=', ['get', 'tier'], 'destination'], ['!', inIds(ids)]])
}

/** Routes of enabled families take pointer events. With a selection, only the selected city's routes do (null means all). */
export function setRouteHit(map: MLMap, cids: string[] | null, families: Family[]) {
  const fam: ExpressionSpecification = ['in', ['get', 'family'], ['literal', families]]
  if (!cids) return map.setFilter(HIT_ROUTES, fam)
  map.setFilter(HIT_ROUTES, cids.length ? ['all', ['in', ['get', 'cid'], ['literal', cids]], fam] : NONE)
}
