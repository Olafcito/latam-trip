import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Flag, hasFlag } from '@map/map/Flag'
import type { RouteStop } from '../../lib/bundle'
import { liveRoute, type LiveRoute } from './routeLive'
import { ItineraryBar } from './ItineraryBar'
import { hereAt, ribbon } from './tripBar'
import { routeLand, routeView, type Canvas } from './routeView'

// A trip as a clean map: only borders, the route and a flag per country, as big as its stay. Each leg
// is coloured by how you travel it, dashed until it is booked. The window draws the route once when it
// opens, opens a country when you tap its flag and lays the itinerary over its foot. The strip on top
// of a trip is the same map laid back, at country level, and opens the window. It loads apart, with
// the map of the world it needs.

const PHONE = '(max-width: 560px)'
const watchPhone = (fn: () => void) => {
  const m = matchMedia(PHONE)
  m.addEventListener('change', fn)
  return () => m.removeEventListener('change', fn)
}
const isPhone = () => matchMedia(PHONE).matches

const WINDOW: Canvas = { w: 1000, h: 1250, tilted: false, room: [270, 190], foot: 230 }
const WINDOW_PHONE: Canvas = { w: 1000, h: 1500, tilted: false, room: [430, 250], foot: 330, flag: 48 }
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
  /** the way in from home is booked */
  inBooked?: boolean
}

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function RouteSummary({ stops, tilted = false, title, dates, from, to, inBooked = false }: Props) {
  const phone = useSyncExternalStore(watchPhone, isPhone)
  const canvas = tilted ? (phone ? STRIP_PHONE : STRIP) : phone ? WINDOW_PHONE : WINDOW
  const uid = useId().replace(/\W/g, '')
  const map = useRef<SVGSVGElement>(null)
  const head = useRef<HTMLDivElement>(null)
  const live = useRef<LiveRoute | null>(null)
  // stops is a new list on every render of the trip, so these go by what it says
  const shape = stops.map((s) => `${s.lon},${s.lat},${s.country}`).join(';')
  const land = useMemo(() => routeLand(stops, canvas), [shape, canvas])
  const said = JSON.stringify(stops)
  const view = useMemo(() => routeView(stops, land, canvas), [said, land, canvas])

  const bar = useMemo(() => ribbon(view, inBooked), [view, inBooked])
  // during the trip the bar starts on the country you are in
  const [chosen, setChosen] = useState<string | null>(() => (tilted ? null : hereAt(bar, today())))
  const [preview, setPreview] = useState<string | null>(null)
  const shown = preview ?? chosen

  useLayoutEffect(() => {
    const l = liveRoute(map.current!, view, { interactive: !tilted, head: head.current, onOpen: (key) => { setPreview(null); setChosen(key) } })
    live.current = l
    return () => { l.stop(); live.current = null }
  }, [view, tilted])
  useEffect(() => { live.current?.focus(shown) }, [shown, view])

  const figure = (
    <svg ref={map} className="rs-map" viewBox={`0 0 ${view.w} ${view.h}`} aria-hidden={tilted || undefined}>
      <path className="rs-land" d={land.land} />
      <path className="rs-lit" d={land.lit} />
      <path className="rs-borders" d={land.borders} />
      {!tilted && (
        <mask id={`${uid}-draw`} maskUnits="userSpaceOnUse" x={0} y={0} width={view.w} height={view.h}>
          <path className="rs-reveal" pathLength={1} />
        </mask>
      )}
      <g className="rs-route">
        <path className="rs-from" />
        <path className="rs-to" />
        {view.stops.slice(1).map((s, i) => (
          <path key={i} className="rs-leg" data-f={s.mode} data-booked={s.booked || undefined} />
        ))}
        {!tilted && view.stops.slice(1).map((s, i) => (
          <path key={i} className="rs-chev" data-f={s.mode} d="M-8 -8 L3 0 L-8 8" />
        ))}
      </g>
      {!tilted && from && <text className="rs-way">From {from}</text>}
      {!tilted && to && <text className="rs-way">To {to}</text>}
      <g className="rs-dots" />
      {[...view.countries].sort((a, b) => b.r - a.r).map((c) => (
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
      <ItineraryBar bar={bar} chosen={chosen} shown={shown} onChoose={(k) => { setPreview(null); setChosen(k) }} onPreview={setPreview} />
    </div>
  )
}
