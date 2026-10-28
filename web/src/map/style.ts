import type { StyleSpecification } from 'maplibre-gl'

export const C = {
  ground: '#0B1720',
  land: '#14252E',
  coast: '#3A5866',
  border: '#2E4855',
  text: '#EAF0F2',
  muted: '#93A7B2',
  bus: '#6FD3B8',
  flight: '#F2B544',
  boat: '#8DB8F2',
  panel: '#F3EFE6',
  ink: '#13202A',
  country: '#6C8593',
  dot: '#F7F3E8',
  road: '#1C313C',
} as const

export const FONT = ['Noto Sans Regular']
export const FONT_BOLD = ['Noto Sans Bold']

/**
 * A muted dark base map: OpenFreeMap vector tiles (no key) and a faint hillshade from the
 * open Terrarium DEM so the Andes and the volcano chains read. No basemap labels, the
 * route data brings its own.
 */
export function baseStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      dem: {
        type: 'raster-dem',
        tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 11,
      },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': C.land } },
      {
        id: 'hillshade',
        type: 'hillshade',
        source: 'dem',
        paint: {
          'hillshade-exaggeration': ['interpolate', ['linear'], ['zoom'], 3, 0.38, 8, 0.25],
          'hillshade-shadow-color': '#071017',
          'hillshade-highlight-color': '#29424F',
          'hillshade-accent-color': '#0E1C24',
          'hillshade-illumination-direction': 315,
        },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'omt',
        'source-layer': 'water',
        filter: ['all', ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
        paint: { 'fill-color': C.ground, 'fill-antialias': true },
      },
      {
        id: 'coast',
        type: 'line',
        source: 'omt',
        'source-layer': 'water',
        filter: ['all', ['match', ['geometry-type'], ['MultiPolygon', 'Polygon'], true, false], ['!=', ['get', 'brunnel'], 'tunnel']],
        paint: {
          'line-color': C.coast,
          'line-opacity': 0.75,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.5, 8, 0.9],
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'omt',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: ['all', ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false], ['match', ['get', 'class'], ['motorway', 'trunk', 'primary'], true, false]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': C.road,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.4, 10, 1.2],
          'line-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 7, 0.9],
        },
      },
      {
        id: 'borders',
        type: 'line',
        source: 'omt',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1], ['!', ['has', 'claimed_by']]],
        layout: { 'line-join': 'round' },
        paint: {
          'line-color': C.border,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3, 0.8, 8, 1.3],
          'line-dasharray': [3, 2],
        },
      },
    ],
  }
}
