import { useMemo } from 'react'
import { geoNaturalEarth1, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Topology } from 'topojson-specification'
import landTopo from 'world-atlas/land-110m.json'
import type { InOut, Way } from '../data/types'

const LAND = feature(landTopo as unknown as Topology, (landTopo as unknown as Topology).objects.land)
const W = 300
const H = 230

/** A small static map of the way in and the way home. Clicking it starts the trip on the route map. */
export function MiniMap({ data, ways, onOpen }: { data: InOut; ways: Way[]; onOpen: () => void }) {
  const view = useMemo(() => {
    const coords: [number, number][] = []
    for (const w of ways) for (const c of w.airports) {
      const a = data.airports[c]
      if (a) coords.push([a.lon, a.lat])
    }
    const proj = geoNaturalEarth1().fitExtent([[18, 18], [W - 40, H - 18]], { type: 'MultiPoint', coordinates: coords })
    const path = geoPath(proj)
    const arcs = ways.map((w) => {
      const pts = w.airports.map((c) => data.airports[c]).filter(Boolean).map((a) => [a.lon, a.lat] as [number, number])
      return { dir: w.direction, d: path({ type: 'LineString', coordinates: pts }) ?? '' }
    })
    const seen = new Set<string>()
    const dots = ways.flatMap((w) => w.airports).filter((c) => !seen.has(c) && seen.add(c)).map((c) => {
      const a = data.airports[c]
      const p = a ? proj([a.lon, a.lat]) : null
      const end = ways.some((w) => w.to === c || w.from === c)
      return p ? { c, x: p[0], y: p[1], end } : null
    }).filter((x): x is { c: string; x: number; y: number; end: boolean } => !!x)
    return { land: path(LAND) ?? '', arcs, dots }
  }, [data, ways])

  return (
    <button type="button" className="minimap" onClick={onOpen} title="Build this trip on the route map">
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Map of the way in and the way home" style={{ background: 'var(--ground)', borderRadius: 10 }}>
      <path d={view.land} style={{ fill: 'var(--surface-2)', stroke: 'var(--line-2)' }} strokeWidth={0.5} />
      {view.arcs.map((a, i) => (
        <path key={i} d={a.d} fill="none" style={{ stroke: a.dir === 'in' ? 'var(--in)' : 'var(--home)' }} strokeWidth={2} strokeLinecap="round" strokeDasharray={a.dir === 'home' ? '5 4' : undefined} />
      ))}
      {view.dots.map((d) => (
        <g key={d.c}>
          <circle cx={d.x} cy={d.y} r={d.end ? 4 : 2.6} style={{ fill: d.end ? 'var(--text)' : 'var(--ground)', stroke: 'var(--text)' }} strokeWidth={1.4} />
          {d.end && <text x={d.x + 6} y={d.y + 3.5} fontSize={10} fontWeight={500} style={{ fill: 'var(--text)', fontFamily: 'var(--font-num)' }}>{d.c}</text>}
        </g>
      ))}
    </svg>
    <span className="minimap-cta">Build on the route map</span>
    </button>
  )
}
