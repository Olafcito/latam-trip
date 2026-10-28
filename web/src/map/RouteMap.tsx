import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Map as MLMap, Marker, setWorkerUrl, type GeoJSONSource, type MapMouseEvent, type PointLike } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ALL_FAMILIES, buildModel, neighbours, otherEnd, routePoints, stopsFrom, viaLine, type Model } from '../data/model'
import { IO_LABEL, ioMarkers, type Dir } from '../data/inout'
import { activeTrip, addLeg, createTrip, deleteTrip, legIndex, openTrip, removeLeg, renameTrip, tripEnd, tripPieces, tripStops, type Trip, type TripLeg, type TripState } from '../data/trips'
import { familyOf, type Connection, type Family, type MapData, type RouteOption } from '../data/types'
import { EASE, along, boundsOf, type Bounds, type LonLat } from '../lib/geo'
import type { Rect } from '../lib/tooltip'
import { Controls } from './Controls'
import { createStore, hoverKey, type Hover } from './hover'
import { HIT_OVERLAND, HIT_PLACES, HIT_ROUTES, LABEL_LAYERS, ROUTE_LAYERS, TRIP_LINE_LAYERS, TRIP_OVERLAND, addRouteLayers, routeOpacity, setLabelFocus, setQuiet, setRouteHit } from './layers'
import { Panel, type FlightDir, type PanelView, type View } from './Panel'
import { TripBar } from './TripBar'
import { TripsPanel } from './TripsPanel'
import { IoLegend, WayPanel } from './WayPanel'
import { C, baseStyle } from './style'
import { Tooltip } from './Tooltip'
import './routeMap.css'

// Vite pre-bundles maplibre, which breaks the worker's relative URL, so point at the file directly.
setWorkerUrl(workerUrl)

export interface RouteMapProps {
  data: MapData
  trips: TripState
  onTrips(update: (s: TripState) => TripState): void
  /** How far a trip fit may zoom in, as a multiple of the whole-map scale. */
  maxFitZoom?: number
  /** Frame the open trip once the map is ready, for a host that opens the map on a trip. */
  fitTripOnLoad?: boolean
  /**
   * Build mode: the host shows one trip and owns its list. The trip bar and trips pane stay
   * hidden, and with nothing selected the map lights the places reachable from the trip's end,
   * so the next leg is one click away.
   */
  focus?: boolean
  /** Build mode: the stop the next leg starts from. Null means the trip's end. */
  focusAt?: string | null
  /** Build mode: a tap on one of the trip's stops hands it to the host, which moves its cursor there. */
  onStop?(id: string): void
  /** Build mode: the host places a new leg itself (after its cursor) instead of the trip appending it. */
  onLeg?(leg: TripLeg): void
  /** A pane the host renders on the right of the map; the camera keeps clear of it. */
  side?: ReactNode
  sideWidth?: number
  /** the side pane is folded to a small card in the top right corner: the map gets the full width */
  sideMini?: boolean
}

const EMPTY: View = { sel: null, panel: null, route: null, from: null, opt: 0, back: null }
const PANEL_W: Record<PanelView, number> = { city: 300, more: 360, route: 360, trips: 340, way: 380 }
/** The most a city tap zooms out, in zoom levels. Chaining legs should not drift the map away. */
const CITY_EASE_OUT = 0.3
const NARROW = 720
const MOVER: Record<Family, [string, string]> = { ground: [C.bus, '#E6FFF7'], boat: [C.boat, '#EEF5FF'], flight: [C.flight, '#FFF4D6'] }
const EMPTY_FC: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

type Point2 = { x: number; y: number }

const reducedMotion = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

const enabledOptions = (conn: Connection, families: Set<Family>) =>
  conn.options.filter((o) => families.has(familyOf(o.mode))).sort((x, y) => (x.duration_min ?? 1e9) - (y.duration_min ?? 1e9))

function connBetween(model: Model, a: string, b: string): Connection | undefined {
  return model.conns.get([a, b].sort().join('-'))
}

export function RouteMap({ data, trips, onTrips, maxFitZoom = 3.2, fitTripOnLoad = false, focus = false, focusAt = null, onStop, onLeg, side = null, sideWidth = 360, sideMini = false }: RouteMapProps) {
  const model = useMemo(() => buildModel(data), [data])
  const available = useMemo(
    () => ALL_FAMILIES.filter((f) => model.routes.features.some((r: { properties: { family: Family } }) => r.properties.family === f)),
    [model],
  )

  const root = useRef<HTMLDivElement>(null)
  const canvasBox = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const controlsRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const tripBarRef = useRef<HTMLDivElement>(null)

  // the map belongs to one model: after a model change its effects must not touch the removed map
  const [built, setBuilt] = useState<{ map: MLMap; model: Model } | null>(null)
  const map = built?.model === model ? built.map : null
  const [view, setView] = useState<View>(EMPTY)
  const [families, setFamilies] = useState<Set<Family>>(() => new Set(available))
  const [collapsed, setCollapsed] = useState(false)
  const [hint, setHint] = useState<'show' | 'fading' | 'gone'>('show')
  const [space, setSpace] = useState(false)
  const [narrow, setNarrow] = useState(false)
  const store = useMemo(() => createStore<Hover>(null), [])

  // latest values for the map's event handlers, which are bound once
  const live = useRef({ view, families, collapsed, space: false, homeZoom: 4, shown: [] as string[], focusId: null as string | null, side: !!side, sideMini, focus, stops: [] as string[], dir: 'out' as FlightDir })
  // which way the selected city's routes read: out of it (the default for every city) or into it
  const [dir, setDir] = useState<FlightDir>('out')
  useEffect(() => setDir('out'), [view.sel, view.panel])
  live.current.view = view
  live.current.families = families
  live.current.side = !!side
  live.current.sideMini = sideMini
  live.current.dir = dir
  live.current.focus = focus
  live.current.collapsed = collapsed

  // ---- camera ----------------------------------------------------------------------------

  /** The part of the map the panel and controls leave free, as padding. */
  const pads = useCallback((panel: PanelView | null) => {
    const el = root.current!
    const W = el.clientWidth
    const H = el.clientHeight
    const open = panel && !live.current.collapsed
    const sideW = live.current.side && !live.current.sideMini ? sideWidth : 0
    const padding =
      W < NARROW
        ? { top: 70, left: 28, right: 64, bottom: open ? Math.round(H * 0.52) + 16 : sideW ? Math.round(H * 0.42) + 16 : 70 }
        : { top: 70, left: open ? PANEL_W[panel!] + 54 : 40, right: sideW ? sideW + 54 : 90, bottom: 70 }
    if (padding.left + padding.right > W - 40 || padding.top + padding.bottom > H - 40) return { top: 20, left: 20, right: 20, bottom: 20 }
    return padding
  }, [sideWidth])

  /** Is a point inside the free part of the map, with a margin? */
  const inView = useCallback(
    (ll: LonLat, panel: PanelView | null, margin = 40) => {
      const el = root.current
      if (!map || !el) return false
      const pad = pads(panel)
      const pt = map.project(ll)
      return pt.x > pad.left + margin && pt.x < el.clientWidth - pad.right - margin && pt.y > pad.top + margin && pt.y < el.clientHeight - pad.bottom - margin
    },
    [map, pads],
  )

  /** Fit bounds, or the whole map when null. Only the home button and opening a trip do this. */
  const fit = useCallback(
    (bounds: Bounds | null, panel: PanelView | null, zoomMul = maxFitZoom, margin = 0) => {
      const m = map
      if (!m || !root.current) return
      const pad = pads(panel)
      const room = Math.min(margin, (root.current.clientWidth - pad.left - pad.right) / 4, (root.current.clientHeight - pad.top - pad.bottom) / 4)
      const padding = { top: pad.top + room, left: pad.left + room, right: pad.right + room, bottom: pad.bottom + room }
      const opts = { padding, duration: reducedMotion() ? 0 : 1000, easing: EASE }
      if (!bounds) m.fitBounds(model.home, { ...opts, padding: root.current.clientWidth < NARROW ? { top: 70, left: 20, right: 64, bottom: 80 } : { top: 70, left: 40, right: 90, bottom: 80 } })
      else m.fitBounds(bounds, { ...opts, maxZoom: live.current.homeZoom + Math.log2(zoomMul) })
    },
    [map, model, maxFitZoom, pads],
  )

  const cityBounds = useCallback(
    (id: string): Bounds => {
      const p = model.byId.get(id)!
      const pts: LonLat[] = [[p.lon, p.lat], ...neighbours(model, id, live.current.families).map((n): LonLat => [n.other.lon, n.other.lat])]
      return boundsOf(pts)
    },
    [model],
  )

  /**
   * Bring a city into view at about the current zoom. It never zooms in, and zooms out by at
   * most CITY_EASE_OUT when the city's neighbours would not fit. A city already in view stays put.
   */
  const showCity = useCallback(
    (id: string, panel: PanelView | null) => {
      const m = map
      const p = model.byId.get(id)
      if (!m || !p) return
      const pad = pads(panel)
      const z = m.getZoom()
      const want = m.cameraForBounds(cityBounds(id), { padding: pad })?.zoom ?? z
      const zoom = want < z ? Math.max(want, z - CITY_EASE_OUT) : z
      const ll: LonLat = [p.lon, p.lat]
      const opts = { zoom, duration: reducedMotion() ? 0 : 700, easing: EASE }
      if (inView(ll, panel)) {
        if (zoom !== z) m.easeTo({ ...opts, around: ll })
      } else m.easeTo({ ...opts, center: ll, offset: [(pad.left - pad.right) / 2, (pad.top - pad.bottom) / 2] })
    },
    [map, model, pads, cityBounds, inView],
  )

  /** Bring a route into view only when an end is off screen, and never zoom in for it. */
  const showRoute = useCallback(
    (conn: Connection) => {
      const m = map
      if (!m) return
      const ends = [conn.a, conn.b].map((id) => model.byId.get(id)!).map((p): LonLat => [p.lon, p.lat])
      if (ends.every((ll) => inView(ll, 'route', 24))) return
      const pts = routePoints(model, conn, enabledOptions(conn, live.current.families))
      m.fitBounds(boundsOf(pts), { padding: pads('route'), maxZoom: m.getZoom(), duration: reducedMotion() ? 0 : 900, easing: EASE })
    },
    [map, model, pads, inView],
  )

  // ---- actions -----------------------------------------------------------------------------

  const dismissHint = useCallback(() => {
    setHint((h) => {
      if (h !== 'show') return h
      setTimeout(() => setHint('gone'), 600)
      return 'fading'
    })
  }, [])

  const select = useCallback(
    (id: string) => {
      store.set(null)
      setCollapsed(false)
      live.current.collapsed = false
      setView({ ...EMPTY, sel: id, panel: 'city' })
      showCity(id, 'city')
    },
    [showCity, store],
  )

  // closing leaves the camera where it is
  const deselect = useCallback(() => {
    store.set(null)
    setView(EMPTY)
  }, [store])

  const openRoute = useCallback(
    (cid: string, from: string, back: View['back'] = 'city') => {
      const conn = model.conns.get(cid)
      if (!conn) return
      store.set(null)
      setView((v) => ({ sel: v.sel ?? from, panel: 'route', route: cid, from, opt: 0, back: v.panel === 'more' ? 'more' : back }))
      showRoute(conn)
    },
    [showRoute, model, store],
  )

  const toCity = useCallback(() => {
    const sel = live.current.view.sel
    if (!sel) return
    setView({ ...EMPTY, sel, panel: 'city' })
    showCity(sel, 'city')
  }, [showCity])

  const back = useCallback(() => {
    const v = live.current.view
    if (v.panel === 'route') {
      if (v.back === 'more' && v.sel) {
        setView({ ...EMPTY, sel: v.sel, panel: 'more' })
        showCity(v.sel, 'more')
      } else if (v.back === 'city') toCity()
      else deselect()
    } else if (v.panel === 'more') toCity()
    else if (v.sel || v.panel) deselect()
  }, [toCity, deselect, showCity])

  // ---- trips ---------------------------------------------------------------------------------

  const trip = activeTrip(trips)
  /** In build mode the host's cursor (or the trip's end) stands in for a selection while nothing is selected. */
  const focusId = focus && trip && !view.sel ? focusAt ?? tripEnd(trip) : null
  live.current.focusId = focusId
  live.current.stops = trip ? tripStops(trip) : []

  // moving the cursor brings that stop into view, at the zoom the map is at
  const lastFocus = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!map || !focus) return
    const prev = lastFocus.current
    lastFocus.current = focusId
    if (focusId && prev !== undefined && prev !== focusId) showCity(focusId, null)
  }, [map, focus, focusId, showCity])

  const showTrips = useCallback(() => {
    store.set(null)
    setCollapsed(false)
    live.current.collapsed = false
    setView({ ...EMPTY, panel: 'trips' })
  }, [store])

  /** Opening a trip fits all of it once, the one time the camera may zoom out far. */
  const fitTrip = useCallback(
    (t: Trip, panel: PanelView | null = 'trips') => {
      const pts = tripStops(t).map((id) => model.byId.get(id)).filter((p) => !!p).map((p): LonLat => [p.lon, p.lat])
      // the margin keeps both ends and their labels clear of the edges
      if (pts.length) fit(boundsOf(pts), panel, 6, 90)
    },
    [fit, model],
  )

  const fitted = useRef<string | null>(null)
  useEffect(() => {
    if (!map || !fitTripOnLoad || !trip || fitted.current === trip.id) return
    fitted.current = trip.id
    fitTrip(trip, null)
  }, [map, fitTripOnLoad, trip, fitTrip])

  const addTripLeg = useCallback(
    (conn: Connection, opt: RouteOption, from: string, cont: boolean) => {
      const leg: TripLeg = { cid: conn.id, from, to: otherEnd(conn, from), mode: opt.mode }
      if (onLeg) {
        // the host's cursor moves to the new stop, so the map lights what comes next from there
        onLeg(leg)
        deselect()
        return
      }
      onTrips((s) => addLeg(s, leg))
      if (cont) select(otherEnd(conn, from))
    },
    [onTrips, onLeg, select, deselect],
  )

  // the pane of the open trip's way in, way home, or both when they share an airport
  const [wayDirs, setWayDirs] = useState<Dir[]>(['in'])
  const openWay = useCallback(
    (dirs: Dir[]) => {
      store.set(null)
      setCollapsed(false)
      live.current.collapsed = false
      setWayDirs(dirs)
      setView({ ...EMPTY, panel: 'way' })
    },
    [store],
  )

  /** A map place for an airport code: the place itself, or the place that has that airport. */
  const placeOf = useCallback((code: string) => (model.byId.has(code) ? code : model.places.find((p) => p.iata === code)?.id ?? null), [model])
  const markers = useMemo(() => ioMarkers(trip, placeOf), [trip, placeOf])

  const act = useRef({ select, deselect, openRoute, openWay, back, dismissHint, onStop })
  act.current = { select, deselect, openRoute, openWay, back, dismissHint, onStop }

  // ---- map setup -------------------------------------------------------------------------

  useEffect(() => {
    const el = canvasBox.current!
    const narrow = el.clientWidth < NARROW
    const m = new MLMap({
      container: el,
      style: baseStyle(),
      bounds: model.home,
      fitBoundsOptions: { padding: narrow ? { top: 70, left: 20, right: 64, bottom: 80 } : { top: 70, left: 40, right: 90, bottom: 80 } },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      renderWorldCopies: false,
      minZoom: 1.5,
      maxZoom: 12,
    })
    m.touchZoomRotate.disableRotation()
    m.keyboard.disableRotation()
    let alive = true
    m.on('load', () => {
      if (!alive) return
      addRouteLayers(m, model)
      live.current.homeZoom = m.getZoom()
      if (import.meta.env.DEV) (window as { __rmap?: MLMap }).__rmap = m
      setBuilt({ map: m, model })
    })
    const ro = new ResizeObserver(() => {
      m.resize()
      setNarrow(el.clientWidth < NARROW)
    })
    ro.observe(el)
    return () => {
      alive = false
      ro.disconnect()
      m.remove()
      setBuilt(null)
    }
  }, [model])

  // ---- highlight: feature-state only, no React render ------------------------------------

  const prev = useRef({ hot: null as string | null, hl: [] as string[], pv: [] as string[], calm: [] as string[], via: [] as string[], stop: [] as string[] })
  const raf = useRef(0)

  const runMover = useCallback(
    (m: MLMap, items: { line: LonLat[]; reverse: boolean; family: Family }[]) => {
      cancelAnimationFrame(raf.current)
      const src = m.getSource<GeoJSONSource>('mover')
      if (!src) return
      if (!items.length || reducedMotion()) {
        src.setData(EMPTY_FC)
        return
      }
      const t0 = performance.now()
      const tick = (now: number) => {
        const t = ((now - t0) % 2600) / 2600
        src.setData({
          type: 'FeatureCollection',
          features: items.map((it) => ({
            type: 'Feature',
            properties: { color: MOVER[it.family][0], core: MOVER[it.family][1] },
            geometry: { type: 'Point', coordinates: along(it.line, it.reverse ? 1 - t : t) },
          })),
        })
        raf.current = requestAnimationFrame(tick)
      }
      raf.current = requestAnimationFrame(tick)
    },
    [],
  )

  const paint = useCallback(() => {
    const m = map
    if (!m) return
    const { view: v, families: fams, shown } = live.current
    const h = store.get()
    const P = prev.current
    const st = (source: string, id: string, s: Record<string, boolean>) => m.setFeatureState({ source, id }, s)
    if (P.hot) st('places', P.hot, { hot: false })
    P.hl.forEach((id) => st('routes', id, { hl: false }))
    P.pv.forEach((id) => st('routes', id, { pv: false }))
    P.calm.forEach((id) => st('routes', id, { calm: false }))
    P.via.forEach((id) => st('routes', id, { via: false }))
    P.stop.forEach((id) => st('places', id, { stop: false }))
    const next = { hot: null as string | null, hl: [] as string[], pv: [] as string[], calm: [] as string[], via: [] as string[], stop: [] as string[] }

    let route: { conn: Connection; from: string; opts: RouteOption[] } | null = null
    if (h?.kind === 'city') {
      next.hot = h.id
      // in build mode the cursor's routes are the only ones shown, so hovering does not preview others
      if (!v.sel && !live.current.focusId) {
        for (const c of model.byPlace.get(h.id) ?? []) for (const f of fams) if (model.routeLines.has(`${c.id}|${f}`)) next.pv.push(`${c.id}|${f}`)
      }
    } else if (h?.kind === 'route') {
      next.hot = h.to
      const conn = model.conns.get(h.cid)
      if (conn) route = { conn, from: h.from, opts: enabledOptions(conn, fams) }
    }
    if (!route && v.panel === 'route' && v.route) {
      const conn = model.conns.get(v.route)
      if (conn) {
        const opts = enabledOptions(conn, fams)
        const cur = opts[Math.min(v.opt, opts.length - 1)]
        route = { conn, from: v.from ?? conn.a, opts: cur ? [cur] : [] }
      }
    }

    const stops: GeoJSON.Feature[] = []
    const vias: GeoJSON.Feature[] = []
    const movers: { line: LonLat[]; reverse: boolean; family: Family }[] = []
    if (route) {
      const seen = new Set<string>()
      const reverse = route.from !== route.conn.a
      // a flight with layovers is drawn through them, in place of its direct arc
      const direct = new Map<string, Family>()
      for (const o of route.opts) {
        const fam = familyOf(o.mode)
        const fid = `${route.conn.id}|${fam}`
        const via = viaLine(model, route.conn, o)
        if (via) {
          vias.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: via } })
          movers.push({ line: via, reverse, family: fam })
        } else direct.set(fid, fam)
        if (model.routeLines.has(fid) && !next.hl.includes(fid)) next.hl.push(fid)
        for (const s of stopsFrom(route.conn, o, route.from)) {
          const p = model.byId.get(s.place_id)
          if (!p || seen.has(p.id)) continue
          seen.add(p.id)
          if (!p.context) next.stop.push(p.id)
          stops.push({
            type: 'Feature',
            properties: { name: p.short_name, kind: s.type, type: s.type, color: MOVER[fam][0] },
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          })
        }
      }
      // the direct arc stays only when an option in focus flies it
      for (const fid of next.hl) {
        const fam = direct.get(fid)
        if (fam) movers.push({ line: model.routeLines.get(fid)!, reverse, family: fam })
        else next.via.push(fid)
      }
      next.calm = shown.filter((id) => !next.hl.includes(id))
    }

    if (next.hot) st('places', next.hot, { hot: true })
    next.hl.forEach((id) => st('routes', id, { hl: true }))
    next.pv.forEach((id) => st('routes', id, { pv: true }))
    next.calm.forEach((id) => st('routes', id, { calm: true }))
    next.via.forEach((id) => st('routes', id, { via: true }))
    next.stop.forEach((id) => st('places', id, { stop: true }))
    prev.current = next
    m.getSource<GeoJSONSource>('stops')?.setData({ type: 'FeatureCollection', features: stops })
    m.getSource<GeoJSONSource>('via')?.setData({ type: 'FeatureCollection', features: vias })
    runMover(m, movers)
  }, [map, model, store, runMover])

  // selection and mode toggles: which places and routes are lit
  useEffect(() => {
    if (!map) return
    const sel = view.sel ?? focusId
    const near = new Set(sel ? neighbours(model, sel, families).map((n) => n.other.id) : [])
    for (const p of model.places) {
      map.setFeatureState({ source: 'places', id: p.id }, { sel: p.id === sel, near: near.has(p.id), dim: !!sel && p.id !== sel && !near.has(p.id) })
    }
    const shown: string[] = []
    const cids = new Set<string>()
    for (const f of model.routes.features) {
      const { fid, cid, family, a, b } = f.properties
      const show = !!sel && (a === sel || b === sel) && families.has(family)
      if (show) {
        shown.push(fid)
        cids.add(cid)
      }
      map.setFeatureState({ source: 'routes', id: fid }, { show })
    }
    live.current.shown = shown
    for (const f of ALL_FAMILIES) {
      if (!map.getLayer(ROUTE_LAYERS[f])) continue
      map.setPaintProperty(ROUTE_LAYERS[f], 'line-opacity', routeOpacity(sel ? 0 : 0.25))
      map.setLayoutProperty(ROUTE_LAYERS[f], 'visibility', families.has(f) ? 'visible' : 'none')
    }
    setRouteHit(map, sel ? [...cids] : null, [...families])
    // build mode shows the trip's own stops and what the cursor reaches, and nothing else
    const quiet = focus && !!sel
    const stops = quiet && trip ? tripStops(trip) : []
    setLabelFocus(map, sel ? [...new Set([sel, ...near, ...stops])] : [], sel, quiet, stops)
    setQuiet(map, quiet)
    // the open trip steps back while a city's own routes are shown
    const dimTrip = !!view.sel
    for (const id of TRIP_LINE_LAYERS) map.setPaintProperty(id, 'line-opacity', (dimTrip ? 0.55 : 1) * (id === 'trip-casing' ? 0.85 : 1))
    map.setPaintProperty(TRIP_OVERLAND, 'line-opacity', dimTrip ? 0.3 : 0.55)
  }, [map, model, view.sel, focusId, families, focus, trip])

  // the open trip: one line per leg or overland block, in travel order, and a numbered dot per stop
  useEffect(() => {
    if (!map) return
    const lines: GeoJSON.Feature[] = []
    for (const piece of trip ? tripPieces(trip) : []) {
      const a = model.byId.get(piece.from)
      const b = model.byId.get(piece.to)
      const straight = a && b && a !== b ? [[a.lon, a.lat], [b.lon, b.lat]] : null
      if (piece.kind === 'overland') {
        const props = { family: 'overland', from: piece.from, to: piece.to, note: piece.note }
        if (straight) lines.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: straight } })
        continue
      }
      const family = familyOf(piece.leg.mode)
      // a leg with no route in the data (the planner's "own way" hops) gets a straight line
      const line = model.routeLines.get(`${piece.leg.cid}|${family}`) ?? straight
      if (line) lines.push({ type: 'Feature', properties: { family }, geometry: { type: 'LineString', coordinates: line } })
    }
    // a place visited twice gets one dot with both numbers
    const order = trip ? tripStops(trip) : []
    const nums = new Map<string, number[]>()
    order.forEach((id, i) => nums.set(id, [...(nums.get(id) ?? []), i + 1]))
    const points: GeoJSON.Feature[] = [...nums].flatMap(([id, n]) => {
      const p = model.byId.get(id)
      if (!p) return []
      return [{ type: 'Feature' as const, properties: { n: n.join(','), end: id === order.at(-1) }, geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] } }]
    })
    map.getSource<GeoJSONSource>('trip')?.setData({ type: 'FeatureCollection', features: lines })
    map.getSource<GeoJSONSource>('trip-stops')?.setData({ type: 'FeatureCollection', features: points })
  }, [map, model, trip])

  // where the open trip flies in and flies home from: a ring per airport, both colours when it is one
  useEffect(() => {
    if (!map) return
    const added = markers.flatMap((m) => {
      const p = model.byId.get(m.place)
      if (!p) return []
      const el = document.createElement('button')
      el.type = 'button'
      el.className = `io-mark ${m.dirs.join('-')}`
      const label = `${m.dirs.map((d) => IO_LABEL[d]).join(' and ')}: ${p.short_name}`
      el.title = label
      el.setAttribute('aria-label', `${label}. Show the flights`)
      el.addEventListener('click', () => act.current.openWay(m.dirs))
      return [new Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map)]
    })
    return () => added.forEach((m) => m.remove())
  }, [map, model, markers])

  // re-light after any view change (route view pins its route) and on hover
  useEffect(() => {
    paint()
  }, [paint, view, families])
  useEffect(() => store.subscribe(paint), [store, paint])
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  // ---- pointer -------------------------------------------------------------------------------

  useEffect(() => {
    if (!map) return
    const canvas = map.getCanvas()

    type Hit = { kind: 'place'; id: string } | { kind: 'route'; cid: string } | { kind: 'overland'; from: string; to: string; note: string }
    const hitAt = (pt: Point2): Hit | null => {
      const z = map.getZoom()
      const sel = live.current.view.sel ?? live.current.focusId
      const lit = new Set(sel ? [sel, ...neighbours(model, sel, live.current.families).map((n) => n.other.id)] : [])
      // hit circles of close cities overlap, so take the dot nearest the pointer
      const near = (id: string) => {
        const p = model.byId.get(id)!
        const s = map.project([p.lon, p.lat])
        return Math.hypot(s.x - pt.x, s.y - pt.y)
      }
      // a drawn label is a visible place, so its text clicks like its dot
      const label = map.queryRenderedFeatures([pt.x, pt.y], { layers: Object.values(LABEL_LAYERS) })[0]
      if (label) return { kind: 'place', id: label.properties.id as string }
      const place = map
        .queryRenderedFeatures([pt.x, pt.y], { layers: [HIT_PLACES] })
        .map((f) => ({ id: f.properties.id as string, tier: f.properties.tier as string }))
        .filter((f) => f.tier === 'destination' || z >= 5.8 || lit.has(f.id))
        .sort((x, y) => near(x.id) - near(y.id))[0]
      if (place) return { kind: 'place', id: place.id }
      const pt2: PointLike = [pt.x, pt.y]
      const land = map.queryRenderedFeatures(pt2, { layers: [HIT_OVERLAND] })[0]
      if (land) return { kind: 'overland', from: land.properties.from as string, to: land.properties.to as string, note: land.properties.note as string }
      const routes = map.queryRenderedFeatures(pt2, { layers: [HIT_ROUTES] })
      if (routes.length) return { kind: 'route', cid: routes[0].properties.cid as string }
      return null
    }

    const hoverFor = (hit: ReturnType<typeof hitAt>): Hover => {
      if (!hit) return null
      if (hit.kind === 'overland') return hit
      const sel = live.current.view.sel ?? live.current.focusId
      if (hit.kind === 'route') {
        const conn = model.conns.get(hit.cid)
        if (!conn) return null
        // in the overview a route reads from its first end, with a city it reads the way its switch says
        const out = sel ?? conn.a
        const from = sel && live.current.dir === 'in' ? otherEnd(conn, out) : out
        return { kind: 'route', cid: conn.id, from, to: otherEnd(conn, from) }
      }
      if (sel && hit.id !== sel) {
        const conn = connBetween(model, sel, hit.id)
        if (conn && enabledOptions(conn, live.current.families).length) {
          return live.current.dir === 'in' ? { kind: 'route', cid: conn.id, from: hit.id, to: sel } : { kind: 'route', cid: conn.id, from: sel, to: hit.id }
        }
      }
      return { kind: 'city', id: hit.id }
    }

    const setHover = (h: Hover) => {
      if (hoverKey(h) !== hoverKey(store.get())) store.set(h)
    }

    const onMove = (e: MapMouseEvent) => {
      if (live.current.space || map.isMoving()) return
      const hit = hitAt(e.point)
      canvas.style.cursor = hit && hit.kind !== 'overland' ? 'pointer' : ''
      setHover(hoverFor(hit))
    }
    const onOut = () => setHover(null)
    const onClick = (e: MapMouseEvent) => {
      act.current.dismissHint()
      // a marker handles its own click
      if ((e.originalEvent.target as Element | null)?.closest?.('.io-mark')) return
      if (live.current.space) return
      const hit = hitAt(e.point)
      const sel = live.current.view.sel
      if (!hit) {
        if (sel) act.current.deselect()
        return
      }
      if (hit.kind === 'overland') return
      // in build mode a tap on one of the trip's stops moves the cursor there
      if (hit.kind === 'place' && live.current.focus && act.current.onStop && hit.id !== sel && hit.id !== live.current.focusId && live.current.stops.includes(hit.id)) {
        act.current.onStop(hit.id)
        if (sel) act.current.deselect()
        return
      }
      // from the trip's end a reachable city opens its route straight away, and back closes it again
      const back = sel ? 'city' : null
      if (hit.kind === 'route') {
        const h = hoverFor(hit)
        if (h?.kind === 'route') act.current.openRoute(h.cid, h.from, back)
        return
      }
      if (hit.id === sel) return act.current.deselect()
      const h = hoverFor(hit)
      if (h?.kind === 'route') act.current.openRoute(h.cid, h.from, back)
      else act.current.select(hit.id)
    }
    const onDrag = () => {
      setHover(null)
      act.current.dismissHint()
    }
    const onWheel = () => act.current.dismissHint()

    map.on('mousemove', onMove)
    map.on('mouseout', onOut)
    map.on('click', onClick)
    map.on('dragstart', onDrag)
    map.on('wheel', onWheel)
    return () => {
      map.off('mousemove', onMove)
      map.off('mouseout', onOut)
      map.off('click', onClick)
      map.off('dragstart', onDrag)
      map.off('wheel', onWheel)
    }
  }, [map, model, store])

  // ---- keyboard ----------------------------------------------------------------------------

  // Esc listens on the window: clicking a row unmounts it, and focus then falls back to the body.
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.key !== 'Escape' || e.defaultPrevented) return
      if (t !== document.body && !root.current?.contains(t)) return
      e.preventDefault()
      act.current.dismissHint()
      act.current.back()
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' && !(e.target as HTMLElement).closest('button, a, input')) {
      e.preventDefault()
      if (!live.current.space) {
        live.current.space = true
        setSpace(true)
        store.set(null)
      }
    }
  }
  const onKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      live.current.space = false
      setSpace(false)
    }
  }

  // ---- controls ----------------------------------------------------------------------------

  const toggle = (f: Family) => {
    act.current.dismissHint()
    setFamilies((cur) => {
      const next = new Set(cur)
      if (next.has(f)) {
        if (next.size === 1) return cur
        next.delete(f)
      } else next.add(f)
      return next
    })
  }

  const getBlocked = useCallback((): Rect[] => {
    const box = root.current?.getBoundingClientRect()
    if (!box) return []
    const rects = [panelRef.current, controlsRef.current, bottomRef.current, tripBarRef.current]
      .filter((e): e is HTMLElement => !!e)
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { left: r.left - box.left - 6, top: r.top - box.top - 6, right: r.right - box.left + 6, bottom: r.bottom - box.top + 6 }
      })
    // the side pane is the host's: its own box when it is in the tree, else the strip the layout gives it
    const pane = root.current?.querySelector<HTMLElement>('.panel.plan')
    if (pane) {
      const r = pane.getBoundingClientRect()
      rects.push({ left: r.left - box.left - 6, top: r.top - box.top - 6, right: r.right - box.left + 6, bottom: r.bottom - box.top + 6 })
    } else if (live.current.side) {
      const W = box.width, H = box.height
      rects.push(W < 720 ? { left: 0, top: H * 0.58 - 6, right: W, bottom: H } : { left: W - sideWidth - 20, top: 0, right: W, bottom: H })
    }
    return rects
  }, [sideWidth])


  return (
    <div
      ref={root}
      className={`rmap${space ? ' grab' : ''}${side ? ' has-side' : ''}${side && sideMini ? ' side-mini' : ''}${view.panel && !collapsed ? ' has-panel' : ''}`}
      style={side ? ({ '--side': `${sideWidth}px` } as CSSProperties) : undefined}
      tabIndex={0}
      role="region"
      aria-label="Route map"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={() => {
        live.current.space = false
        setSpace(false)
      }}
    >
      <div ref={canvasBox} className="rmap-canvas" />
      <div className="rmap-vignette" />
      {!map && <div className="rmap-loading mono">Loading map…</div>}
      {map && (
        <>
          <Controls
            available={available}
            families={families}
            onToggle={toggle}
            onZoom={(d) => {
              act.current.dismissHint()
              map.zoomTo(map.getZoom() + d, { duration: reducedMotion() ? 0 : 400 })
            }}
            onHome={() => {
              act.current.dismissHint()
              deselect()
              fit(null, null)
            }}
            hint={hint}
            controlsRef={controlsRef}
            bottomRef={bottomRef}
            extraLegend={markers.length ? <IoLegend markers={markers} /> : null}
          />
          <Tooltip map={map} model={model} store={store} families={families} getBlocked={getBlocked} />
          {!focus && (
            <TripBar
              model={model}
              trip={trip}
              count={trips.trips.length}
              left={view.panel && !narrow ? PANEL_W[view.panel] + 28 : null}
              barRef={tripBarRef}
              onList={showTrips}
              onUndo={() => trip && onTrips((s) => removeLeg(s, trip.id, trip.legs.length - 1))}
              onClose={() => onTrips((s) => openTrip(s, null))}
            />
          )}
          {view.panel === 'way' && trip?.inout && (
            <WayPanel
              model={model}
              trip={trip}
              dirs={wayDirs}
              collapsed={collapsed}
              panelRef={panelRef}
              onCollapse={setCollapsed}
              onClose={deselect}
            />
          )}
          {view.panel === 'trips' && !focus && (
            <TripsPanel
              model={model}
              trips={trips}
              collapsed={collapsed}
              panelRef={panelRef}
              onCollapse={setCollapsed}
              onClose={deselect}
              onCreate={(name) => {
                onTrips((s) => createTrip(s, name))
                deselect()
              }}
              onOpen={(t) => {
                onTrips((s) => openTrip(s, t.id))
                fitTrip(t)
              }}
              onShut={() => onTrips((s) => openTrip(s, null))}
              onRename={(id, name) => onTrips((s) => renameTrip(s, id, name))}
              onDelete={(id) => onTrips((s) => deleteTrip(s, id))}
              onRemoveLeg={(id, i) => onTrips((s) => removeLeg(s, id, i))}
              onGoTo={select}
            />
          )}
          <Panel
            model={model}
            view={view}
            dir={dir}
            onDir={setDir}
            families={families}
            collapsed={collapsed}
            trip={trip}
            panelRef={panelRef}
            onCollapse={setCollapsed}
            onClose={deselect}
            onMore={() => setView((v) => ({ ...v, panel: 'more' }))}
            onCity={toCity}
            onBack={back}
            onRoute={(cid, from) => openRoute(cid, from)}
            onOption={(i) => setView((v) => ({ ...v, opt: i }))}
            onGoTo={select}
            onHoverRoute={(cid, from) => {
              if (!cid || !from) return store.set(null)
              const conn = model.conns.get(cid)
              if (conn) store.set({ kind: 'route', cid, from, to: otherEnd(conn, from) })
            }}
            onAddLeg={trip ? addTripLeg : undefined}
            onRemoveLeg={(i) => trip && onTrips((s) => removeLeg(s, trip.id, i))}
            legIndex={(cid, from, mode) => (trip ? legIndex(trip, cid, from, mode) : -1)}
          />
          {side}
        </>
      )}
    </div>
  )
}
