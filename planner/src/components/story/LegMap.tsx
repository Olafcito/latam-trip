import { useMemo } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import world from 'world-atlas/countries-110m.json'
import type { Family } from '@map/data/types'

// A little map of a bus or boat leg: the countries it crosses and its way from stop to stop, drawn in
// the mode of the leg the way the route map draws it. Only the two ends carry a name, the ticket
// lists the places between.

export interface LegPoint { name: string; lat: number; lon: number }

const W = 332
const H = 150
const topo = world as unknown as Topology<{ countries: GeometryCollection }>
const LAND = feature(topo, topo.objects.countries)
const BORDERS = mesh(topo, topo.objects.countries, (a, b) => a !== b)

export default function LegMap({ points, family }: { points: LegPoint[]; family: Family }) {
  const view = useMemo(() => {
    const lons = points.map((p) => p.lon)
    const lats = points.map((p) => p.lat)
    const lon = [Math.min(...lons), Math.max(...lons)]
    const lat = [Math.min(...lats), Math.max(...lats)]
    // a short leg keeps some land around it
    const dx = Math.max(1.5, (lon[1] - lon[0]) / 2 + 0.5)
    const dy = Math.max(1.5, (lat[1] - lat[0]) / 2 + 0.5)
    const cx = (lon[0] + lon[1]) / 2
    const cy = (lat[0] + lat[1]) / 2
    const proj = geoMercator()
      .fitExtent([[24, 22], [W - 24, H - 22]], { type: 'MultiPoint', coordinates: [[cx - dx, cy - dy], [cx + dx, cy + dy]] })
      .clipExtent([[0, 0], [W, H]])
    const path = geoPath(proj)
    return {
      land: path(LAND) ?? '',
      borders: path(BORDERS) ?? '',
      at: points.map((p) => proj([p.lon, p.lat]) ?? [0, 0]),
    }
  }, [points])
  const last = view.at.length - 1
  const line = view.at.map(([x, y], i) => `${i ? 'L' : 'M'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const first = points[0]
  const end = points[last]
  // the higher end names itself above its dot, the lower one below, so the two never meet
  const firstUp = view.at[0][1] <= view.at[last][1]
  const label = (p: LegPoint, [x, y]: number[], up: boolean) => (
    <span
      key={p.name}
      className="lm-name"
      data-up={up}
      data-left={x > W * 0.6}
      style={{ left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` }}
    >
      {p.name}
    </span>
  )
  return (
    <figure className="lm" data-f={family}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of the way from ${first.name} to ${end.name}`}>
        <path className="lm-land" d={view.land} />
        <path className="lm-borders" d={view.borders} />
        <path className="lm-way" d={line} />
        {view.at.map(([x, y], i) => (i === 0 || i === last ? null : <circle key={i} className="lm-via" cx={x} cy={y} r={2.5} />))}
        <circle className="lm-end" cx={view.at[0][0]} cy={view.at[0][1]} r={4} />
        <circle className="lm-end" cx={view.at[last][0]} cy={view.at[last][1]} r={4} />
      </svg>
      {label(first, view.at[0], firstUp)}
      {label(end, view.at[last], !firstUp)}
    </figure>
  )
}
