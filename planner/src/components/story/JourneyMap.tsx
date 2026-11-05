import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { geoMercator, geoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import land from 'world-atlas/land-50m.json'
import type { Place } from '../../lib/purchase'

// The map of a purchase: every airport it touches, drawn where it is on a quiet land mass. The journey on screen
// reads solid and named, the flight you look at is gold with the plane on it, and the other journeys of the
// purchase are faint dashes with their airports as hollow marks. A press on an airport of this journey shows the
// flight that leaves it, a press on one of another journey opens that journey. It measures its box and draws to
// it, so it is sharp and true at any size.

export interface MapJourney { id: string; flights: { from: string; to: string }[] }

const topo = land as unknown as Topology<{ land: GeometryCollection }>
const LAND = feature(topo, topo.objects.land)
/** how far an arc bows out, as a share of its length. Flown the other way it bows to the other side */
const BOW = 0.18
const PAD = 44

interface Pin { code: string; x: number; y: number; state: 'end' | 'mine' | 'other'; left: boolean; name: string }

export default function JourneyMap({ journeys, active, flight, places, onFlight, onJourney }: {
  journeys: MapJourney[]
  /** the id of the journey on screen */
  active: string
  /** the index of the flight looked at in it */
  flight: number
  places: Record<string, Place>
  onFlight: (i: number) => void
  onJourney: (id: string) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => {
      const r = el.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) setSize((s) => (s && Math.abs(s.w - r.width) < 1 && Math.abs(s.h - r.height) < 1 ? s : { w: r.width, h: r.height }))
    }
    read()
    const ro = new ResizeObserver(read)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const mine = journeys.find((j) => j.id === active) ?? journeys[0]
  const view = useMemo(() => {
    if (!size) return null
    const { w, h } = size
    const pts = Object.values(places)
    if (!pts.length) return null
    const lons = pts.map((p) => p.lon)
    const lats = pts.map((p) => p.lat)
    // a short journey keeps some land around it
    const cx = (Math.min(...lons) + Math.max(...lons)) / 2
    const cy = (Math.min(...lats) + Math.max(...lats)) / 2
    const dx = Math.max(2, (Math.max(...lons) - Math.min(...lons)) / 2)
    const dy = Math.max(1.5, (Math.max(...lats) - Math.min(...lats)) / 2)
    const proj = geoMercator()
      .fitExtent([[PAD, PAD * 0.8], [w - PAD, h - PAD * 0.8]], { type: 'MultiPoint', coordinates: [[cx - dx, cy - dy], [cx + dx, cy + dy]] })
      .clipExtent([[-8, -8], [w + 8, h + 8]])
    const at = (code: string) => {
      const p = places[code]
      return p ? (proj([p.lon, p.lat]) as [number, number] | null) : null
    }
    return { w, h, land: geoPath(proj)(LAND) ?? '', at }
  }, [size, places])

  const arcs = useMemo(() => {
    if (!view) return []
    return journeys.flatMap((j) => j.flights.flatMap((f, i) => {
      const a = view.at(f.from)
      const b = view.at(f.to)
      if (!a || !b) return []
      const [x1, y1] = a
      const [x2, y2] = b
      const qx = (x1 + x2) / 2 - (y2 - y1) * BOW
      const qy = (y1 + y2) / 2 + (x2 - x1) * BOW
      const state = j.id === mine?.id ? (i === flight ? 'on' : 'mine') : 'other'
      return [{
        key: `${j.id}-${i}`, state, d: `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
        mid: [0.25 * x1 + 0.5 * qx + 0.25 * x2, 0.25 * y1 + 0.5 * qy + 0.25 * y2] as const,
        // the way the curve runs at its middle is the way from one end to the other
        angle: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI,
      }]
    }))
  }, [view, journeys, mine?.id, flight])

  const pins = useMemo((): Pin[] => {
    if (!view || !mine) return []
    const codes = [...new Set(journeys.flatMap((j) => j.flights.flatMap((f) => [f.from, f.to])))]
    const here = mine.flights.length ? [mine.flights[0].from, ...mine.flights.map((f) => f.to)] : []
    const now = mine.flights[flight]
    const out = codes.flatMap((code): Pin[] => {
      const p = view.at(code)
      if (!p) return []
      const state = now && (code === now.from || code === now.to) ? 'end' : here.includes(code) ? 'mine' : 'other'
      return [{ code, x: p[0], y: p[1], state, left: p[0] > view.w * 0.72, name: places[code]?.name ?? code }]
    })
    // two names that would sit on each other: the one more to the left takes the left side
    const named = out.filter((p) => p.state !== 'other').sort((a, b) => a.x - b.x)
    for (let i = 1; i < named.length; i++) {
      const a = named[i - 1]
      const b = named[i]
      if (Math.abs(a.y - b.y) < 22 && Math.abs(a.x - b.x) < 64 && a.left === b.left) {
        if (a.x >= 56) a.left = true
        else b.left = false
      }
    }
    return out
  }, [view, journeys, mine, flight, places])

  const on = arcs.find((a) => a.state === 'on')
  const here = mine && mine.flights.length ? [mine.flights[0].from, ...mine.flights.map((f) => f.to)] : []
  const press = (code: string) => {
    const k = here.indexOf(code)
    if (k >= 0 && mine) return onFlight(Math.min(k, mine.flights.length - 1))
    const other = journeys.find((j) => j.id !== mine?.id && j.flights.some((f) => f.from === code || f.to === code))
    if (other) onJourney(other.id)
  }

  return (
    <div ref={box} className="jm">
      {view && (
        <>
          <svg viewBox={`0 0 ${view.w} ${view.h}`} width={view.w} height={view.h} aria-hidden="true">
            <path className="jm-land" d={view.land} />
            {arcs.filter((a) => a.state === 'other').map((a) => <path key={a.key} className="jm-arc" data-s="other" d={a.d} />)}
            {arcs.filter((a) => a.state === 'mine').map((a) => <path key={a.key} className="jm-arc" data-s="mine" d={a.d} />)}
            {on && <path className="jm-arc" data-s="on" d={on.d} />}
            {on && (
              <g className="jm-plane" transform={`translate(${on.mid[0].toFixed(1)} ${on.mid[1].toFixed(1)}) rotate(${on.angle.toFixed(0)})`}>
                <circle r="11" />
                <path d="M-7 -0.9l7.6 0.4-2.6-2.7h1.7l3.8 2.9 3.5 0.2c0.8 0.1 0.8 1 0 1.1l-3.5 0.2-3.8 2.9h-1.7l2.6-2.7-7.6 0.4-1.2 1.5h-1.2l0.8-2.3-0.8-2.3h1.2z" />
              </g>
            )}
          </svg>
          {pins.map((p) => (
            <button
              key={p.code} type="button" className="jm-pin" data-s={p.state} data-left={p.left || undefined}
              style={{ left: p.x, top: p.y }}
              aria-label={p.state === 'other' ? `${p.name}, open the other journey on this purchase` : `${p.name}, show the flight from here`}
              title={p.name} onClick={() => press(p.code)}
            >
              <i aria-hidden="true" />
              {p.state !== 'other' && <span aria-hidden="true">{p.code}</span>}
            </button>
          ))}
        </>
      )}
    </div>
  )
}
