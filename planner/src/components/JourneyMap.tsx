import { useEffect, useRef } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { GeoJSONSource, Map as MLMap, MapLayerMouseEvent, StyleSpecification } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { geoInterpolate } from 'd3-geo'
import type { Feature, FeatureCollection, LineString, Point } from 'geojson'
import type { AppData, StopItem, Way } from '../data/types'
import type { Journey } from '../lib/journey'
import { hours } from '../lib/format'
import { MODE_COLOR } from '../lib/colors'
import { usePlaceHover } from './PlaceCard'

const STYLE = 'https://tiles.openfreemap.org/styles/positron'

// The bundler does not see maplibre's worker, so hand it the URL of the copied file.
maplibregl.setWorkerUrl(workerUrl)

// Used when the tile server cannot be reached: the routes still draw on a plain background.
const FALLBACK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#eef2f5' } }],
}

async function pickStyle(): Promise<string | StyleSpecification> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 6000)
  try {
    const res = await fetch(STYLE, { signal: ctrl.signal })
    return res.ok ? STYLE : FALLBACK
  } catch {
    return FALLBACK
  } finally {
    clearTimeout(t)
  }
}

function arc(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const f = geoInterpolate(a, b)
  return Array.from({ length: n + 1 }, (_, i) => f(i / n) as [number, number])
}

function bend(a: [number, number], b: [number, number]): [number, number][] {
  // a light curve for regional flights so they read apart from roads
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2
  const dx = b[0] - a[0], dy = b[1] - a[1]
  const c: [number, number] = [mx - dy * 0.15, my + dx * 0.15]
  return Array.from({ length: 25 }, (_, i) => {
    const t = i / 24, u = 1 - t
    return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]
  })
}

function buildGeo(data: AppData, j: Journey, wi: Way, wh: Way) {
  const { inout, map } = data
  const nodeXY = (id: string): [number, number] | null => {
    const n = map.nodes.find((x) => x.id === id)
    if (n) return [n.lon, n.lat]
    const a = inout.airports[id]
    return a ? [a.lon, a.lat] : null
  }
  const apXY = (c: string): [number, number] | null => (inout.airports[c] ? [inout.airports[c].lon, inout.airports[c].lat] : null)
  const ways: Feature<LineString>[] = []
  for (const w of [wi, wh]) {
    const pts = w.airports.map(apXY).filter((p): p is [number, number] => !!p)
    const coords: [number, number][] = []
    for (let i = 1; i < pts.length; i++) coords.push(...arc(pts[i - 1], pts[i]))
    ways.push({ type: 'Feature', properties: { dir: w.direction }, geometry: { type: 'LineString', coordinates: coords } })
  }
  const hops: Feature<LineString>[] = []
  j.places.forEach((p) => {
    if (!p.hop) return
    const a = nodeXY(p.hop.from), b = nodeXY(p.hop.to)
    if (!a || !b) return
    hops.push({ type: 'Feature', properties: { mode: p.hop.mode, color: MODE_COLOR[p.hop.mode] ?? '#666' }, geometry: { type: 'LineString', coordinates: p.hop.mode === 'flight' ? bend(a, b) : [a, b] } })
  })
  const inJourney = new Set(j.places.map((p) => p.node))
  const nodes: Feature<Point>[] = map.nodes.map((n) => ({
    type: 'Feature', properties: { id: n.id, name: n.name, on: inJourney.has(n.id) ? 1 : 0, pop: n.popularity }, geometry: { type: 'Point', coordinates: [n.lon, n.lat] },
  }))
  const stops = [...wi.timeline, ...wh.timeline].filter((x): x is StopItem => x.kind !== 'flight')
  return {
    ways: { type: 'FeatureCollection', features: ways } as FeatureCollection,
    hops: { type: 'FeatureCollection', features: hops } as FeatureCollection,
    nodes: { type: 'FeatureCollection', features: nodes } as FeatureCollection,
    stops: stops.map((s) => ({ s, xy: apXY(s.airport) })).filter((x) => !!x.xy) as { s: StopItem; xy: [number, number] }[],
    bounds: [...j.places.map((p) => nodeXY(p.node)), apXY(wi.to), apXY(wh.from)].filter((p): p is [number, number] => !!p),
  }
}

/** MapLibre map of the journey: ways in/home as arcs, hub stops, hops coloured by mode; click a place to add it. */
export function JourneyMap({ data, journey, wi, wh, onPickNode }: { data: AppData; journey: Journey; wi: Way; wh: Way; onPickNode: (id: string) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markers = useRef<maplibregl.Marker[]>([])
  const pick = useRef(onPickNode)
  const ready = useRef(false)
  const pending = useRef<(() => void) | null>(null)
  pick.current = onPickNode

  useEffect(() => {
    if (!el.current) return
    let cancelled = false
    let created: MLMap | null = null
    pickStyle().then((style) => {
    if (cancelled || !el.current) return
    const hasGlyphs = typeof style === 'string'
    const m = new maplibregl.Map({ container: el.current, style, center: [-75, 5], zoom: 2.3, attributionControl: { compact: true } })
    mapRef.current = m
    created = m
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    m.on('load', () => {
      const empty: FeatureCollection = { type: 'FeatureCollection', features: [] }
      m.addSource('ways', { type: 'geojson', data: empty })
      m.addSource('hops', { type: 'geojson', data: empty })
      m.addSource('nodes', { type: 'geojson', data: empty })
      m.addLayer({ id: 'ways', type: 'line', source: 'ways', paint: { 'line-color': ['match', ['get', 'dir'], 'in', '#1f4fb8', '#2e7d5b'], 'line-width': 2, 'line-opacity': 0.8 }, layout: { 'line-cap': 'round' } })
      m.addLayer({ id: 'hops-road', type: 'line', source: 'hops', filter: ['in', ['get', 'mode'], ['literal', ['bus', 'chicken_bus', 'colectivo', 'train']]], paint: { 'line-color': ['get', 'color'], 'line-width': 3 } })
      m.addLayer({ id: 'hops-shuttle', type: 'line', source: 'hops', filter: ['==', ['get', 'mode'], 'shuttle'], paint: { 'line-color': ['get', 'color'], 'line-width': 1.6 } })
      m.addLayer({ id: 'hops-boat', type: 'line', source: 'hops', filter: ['==', ['get', 'mode'], 'boat'], paint: { 'line-color': '#3d7fd6', 'line-width': 2.5, 'line-dasharray': [3, 2] } })
      m.addLayer({ id: 'hops-flight', type: 'line', source: 'hops', filter: ['==', ['get', 'mode'], 'flight'], paint: { 'line-color': '#c27a1c', 'line-width': 2.5, 'line-dasharray': [0.5, 2] }, layout: { 'line-cap': 'round' } })
      m.addLayer({ id: 'nodes', type: 'circle', source: 'nodes', paint: {
        'circle-radius': ['case', ['==', ['get', 'on'], 1], 6, ['interpolate', ['linear'], ['get', 'pop'], 1, 4, 3, 2.5]],
        'circle-color': ['case', ['==', ['get', 'on'], 1], '#1e2328', '#ffffff'],
        'circle-stroke-color': '#1e2328', 'circle-stroke-width': 1.2, 'circle-opacity': 0.95,
      } })
      if (hasGlyphs) m.addLayer({ id: 'node-labels', type: 'symbol', source: 'nodes', filter: ['any', ['==', ['get', 'on'], 1], ['<=', ['get', 'pop'], 1]], layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0.8, 0], 'text-anchor': 'left', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': '#1e2328', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 } })
      m.on('click', 'nodes', (e: MapLayerMouseEvent) => { const id = e.features?.[0]?.properties?.id; if (id) pick.current(String(id)) })
      m.on('mouseenter', 'nodes', () => { m.getCanvas().style.cursor = 'pointer' })
      m.on('mousemove', 'nodes', (e: MapLayerMouseEvent) => {
        const id = e.features?.[0]?.properties?.id
        const n = data.map.nodes.find((x) => x.id === id)
        if (n?.profile) usePlaceHover.getState().show(n, e.originalEvent.clientX, e.originalEvent.clientY)
      })
      m.on('mouseleave', 'nodes', () => { m.getCanvas().style.cursor = ''; usePlaceHover.getState().hide() })
      ready.current = true
      pending.current?.()
      pending.current = null
    })
    })
    return () => { cancelled = true; ready.current = false; (created as MLMap | null)?.remove(); mapRef.current = null }
  }, [data])

  useEffect(() => {
    const m = mapRef.current
    if (!m) return
    const apply = () => {
      const g = buildGeo(data, journey, wi, wh)
      ;(m.getSource('ways') as GeoJSONSource | undefined)?.setData(g.ways)
      ;(m.getSource('hops') as GeoJSONSource | undefined)?.setData(g.hops)
      ;(m.getSource('nodes') as GeoJSONSource | undefined)?.setData(g.nodes)
      markers.current.forEach((mk) => mk.remove())
      markers.current = g.stops.map(({ s, xy }) => {
        const d = document.createElement('div')
        const size = Math.max(16, Math.min(34, 10 + s.hours * 1.2))
        const night = s.kind === 'night'
        d.style.cssText = `width:${size}px;height:${size}px;border-radius:50%;display:grid;place-items:center;background:${night ? '#ece8fa' : '#fbebd7'};border:2px solid ${night ? '#4b3c8c' : '#8a4b0f'};color:${night ? '#4b3c8c' : '#8a4b0f'};font:700 10px Inter,sans-serif`
        d.title = `${s.airport}: ${s.kind.replace('_', ' ')}, ${hours(s.hours)} on the ground${s.nights ? `, ${s.nights} night` : ''}`
        d.innerHTML = night
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M7 4v7a5 5 0 0 0 10 0V4"/><path d="M4 20h16"/></svg>'
        return new maplibregl.Marker({ element: d }).setLngLat(xy).addTo(m)
      })
      if (g.bounds.length) {
        const b = new maplibregl.LngLatBounds(g.bounds[0], g.bounds[0])
        g.bounds.forEach((p) => b.extend(p))
        m.fitBounds(b, { padding: 60, maxZoom: 6, duration: 800 })
      }
    }
    if (ready.current) apply()
    else pending.current = apply
  }, [data, journey, wi, wh])

  return (
    <div className="card mapbox">
      <div ref={el} style={{ position: 'absolute', inset: 0 }} />
      <div className="maplegend">
        <span><svg width="20" height="6" aria-hidden="true"><path d="M1 3H19" stroke="#1f4fb8" strokeWidth="2" /></svg>Way in</span>
        <span><svg width="20" height="6" aria-hidden="true"><path d="M1 3H19" stroke="#2e7d5b" strokeWidth="2" /></svg>Way home</span>
        <span><svg width="20" height="6" aria-hidden="true"><path d="M1 3H19" stroke="#4d7c5c" strokeWidth="3" /></svg>Bus</span>
        <span><svg width="20" height="6" aria-hidden="true"><path d="M1 3H19" stroke="#c27a1c" strokeWidth="2.5" strokeDasharray="1 4" strokeLinecap="round" /></svg>Flight</span>
        <span><svg width="20" height="6" aria-hidden="true"><path d="M1 3H19" stroke="#3d7fd6" strokeWidth="2.5" strokeDasharray="5 3" /></svg>Boat</span>
        <span className="muted">Click a place to add it</span>
      </div>
    </div>
  )
}
