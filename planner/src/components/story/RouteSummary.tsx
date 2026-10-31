import { useId, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { Flag, hasFlag } from '@map/map/Flag'
import type { RouteStop } from '../../lib/bundle'
import { liveRoute } from './routeLive'
import { routeLand, routeView, type Canvas } from './routeView'

// A trip as a clean map: only borders, the line and a flag per country with its nights. The window
// opens a country when you tap its flag. The strip on top of a trip is the same map laid back, at
// country level, and opens the window. It loads apart, with the map of the world it needs.

const PHONE = '(max-width: 560px)'
const watchPhone = (fn: () => void) => {
  const m = matchMedia(PHONE)
  m.addEventListener('change', fn)
  return () => m.removeEventListener('change', fn)
}
const isPhone = () => matchMedia(PHONE).matches

const WINDOW: Canvas = { w: 1000, h: 1250, tilted: false, room: [270, 190] }
const WINDOW_PHONE: Canvas = { w: 1000, h: 1500, tilted: false, room: [430, 250] }
const STRIP: Canvas = { w: 1000, h: 250, tilted: true }
const STRIP_PHONE: Canvas = { w: 1000, h: 460, tilted: true, bare: true }

function Disc({ code, r, clip }: { code: string; r: number; clip: string }) {
  return (
    <g className="rs-disc">
      <clipPath id={clip}><circle r={r} /></clipPath>
      <circle r={r} className="rs-blank" />
      {hasFlag(code)
        ? <g clipPath={`url(#${clip})`}><g transform={`translate(${-1.8 * r} ${-1.2 * r})`}><Flag code={code} size={2.4 * r} /></g></g>
        : <text className="rs-code" textAnchor="middle" dy=".35em" fontSize={r * 0.7}>{code}</text>}
      <circle r={r} className="rs-ring" />
    </g>
  )
}

interface Props {
  stops: RouteStop[]
  /** the strip: laid back, country level, nothing in it to press */
  tilted?: boolean
  title?: string
  dates?: string
  from?: string
  to?: string
}

export default function RouteSummary({ stops, tilted = false, title, dates, from, to }: Props) {
  const phone = useSyncExternalStore(watchPhone, isPhone)
  const canvas = tilted ? (phone ? STRIP_PHONE : STRIP) : phone ? WINDOW_PHONE : WINDOW
  const uid = useId().replace(/\W/g, '')
  const map = useRef<SVGSVGElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const hint = useRef<HTMLParagraphElement>(null)
  // stops is a new list on every render of the trip, so these go by what it says
  const shape = stops.map((s) => `${s.lon},${s.lat},${s.country}`).join(';')
  const land = useMemo(() => routeLand(stops, canvas), [shape, canvas])
  const said = JSON.stringify(stops)
  const view = useMemo(() => routeView(stops, land, canvas), [said, land, canvas])

  useLayoutEffect(() => liveRoute(map.current!, view, { interactive: !tilted, head: head.current, hint: hint.current }), [view, tilted])

  const figure = (
    <svg ref={map} className="rs-map" viewBox={`0 0 ${view.w} ${view.h}`} aria-hidden={tilted || undefined}>
      <path className="rs-land" d={land.land} />
      <path className="rs-lit" d={land.lit} />
      <path className="rs-borders" d={land.borders} />
      <path className="rs-from" />
      <path className="rs-to" />
      <path className="rs-line" />
      {!tilted && view.stops.filter((s) => s.fly).map((_, i) => <path key={i} className="rs-chev" d="M-11 -11 L5 0 L-11 11" />)}
      {!tilted && from && <text className="rs-way">From {from}</text>}
      {!tilted && to && <text className="rs-way">To {to}</text>}
      <g className="rs-dots" />
      {view.countries.map((c) => (
        <g
          key={c.key}
          data-key={c.key}
          className="rs-flag"
          {...(tilted ? {} : { 'data-t': c.key, tabIndex: 0, role: 'button', 'aria-expanded': false, 'aria-label': `${c.name}, ${c.nights}` })}
        >
          {!tilted && <circle className="rs-hit" r={c.r + 16} fill="transparent" />}
          <g className="rs-size"><Disc code={c.code} r={c.r} clip={`${uid}-${c.key}`} /></g>
        </g>
      ))}
      <g className="rs-labels" />
    </svg>
  )
  if (tilted) return figure

  return (
    <div className="rs">
      <div ref={head} className="rs-head">
        <h3>{title}</h3>
        {dates && <p>{dates}</p>}
      </div>
      {figure}
      <p ref={hint} className="rs-hint">Tap a flag to open its country</p>
    </div>
  )
}
