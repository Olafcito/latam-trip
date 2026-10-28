import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import type { Map as MLMap } from 'maplibre-gl'
import { countries, countryName, neighbours, pairFlights, routePoints, viaText, type Model } from '../data/model'
import { familyOf, type Family, type RouteOption } from '../data/types'
import type { LonLat } from '../lib/geo'
import { duration, fromPrice, kr, modeLabel } from '../lib/format'
import { placeTip, type Rect } from '../lib/tooltip'
import { hoverKey, type Hover, type Store } from './hover'
import { Moon } from './icons'

interface Props {
  map: MLMap
  model: Model
  store: Store<Hover>
  families: Set<Family>
  getBlocked(): Rect[]
}

export function Tooltip({ map, model, store, families, getBlocked }: Props) {
  const hover = useSyncExternalStore(store.subscribe, store.get)
  const el = useRef<HTMLDivElement>(null)

  let points: LonLat[] = []
  let body: React.ReactNode = null
  if (hover?.kind === 'city') {
    const p = model.byId.get(hover.id)
    if (p) {
      const country = countryName(model, p.country)
      const n = neighbours(model, p.id, families).length
      points = [[p.lon, p.lat]]
      body = (
        <>
          <p className="tip-t">{p.short_name}, {country}</p>
          {p.why && <p className="tip-s">{p.why}</p>}
          <p className="tip-foot mono">{n} connection{n === 1 ? '' : 's'} · click to explore</p>
        </>
      )
    }
  } else if (hover?.kind === 'overland') {
    const a = model.byId.get(hover.from)
    const b = model.byId.get(hover.to)
    if (a && b) {
      points = [[a.lon, a.lat], [b.lon, b.lat]]
      body = (
        <>
          <p className="tip-t">{a.short_name} to {b.short_name}</p>
          <p className="tip-c mono">Overland</p>
          {hover.note && <p className="tip-s">{hover.note}</p>}
        </>
      )
    }
  } else if (hover?.kind === 'route') {
    const conn = model.conns.get(hover.cid)
    const a = model.byId.get(hover.from)
    const b = model.byId.get(hover.to)
    if (conn && a && b) {
      const opts = conn.options
        .filter((o) => families.has(familyOf(o.mode)))
        .sort((x, y) => (x.duration_min ?? 1e9) - (y.duration_min ?? 1e9))
      points = routePoints(model, conn, opts)
      // a flight is priced each way from the crawl, read from the hovered end
      const price = (o: RouteOption) => {
        const out = o.mode === 'flight' && a.iata && b.iata ? pairFlights(model, a.iata, b.iata)[0]?.dkk : undefined
        const back = o.mode === 'flight' && a.iata && b.iata ? pairFlights(model, b.iata, a.iata)[0]?.dkk : undefined
        if (out == null && back == null) return fromPrice(o.price_dkk.min)
        return <>{out != null && <>out {kr(out)}</>}{out != null && back != null && <br />}{back != null && <>in {kr(back)}</>}</>
      }
      body = (
        <>
          <p className="tip-t">{a.short_name} to {b.short_name}</p>
          <p className="tip-c mono">{countries(model, a, b)}</p>
          <div className="tip-rows">
            {opts.map((o, i) => (
              <div className="tip-row" key={i}>
                <span className={`mdot ${familyOf(o.mode)}`} />
                <span className="tip-mode">{modeLabel(o.mode)}{o.overnight && <span title="Overnight"><Moon /></span>}</span>
                <span className="tip-nums mono"><b>{duration(o.duration_min)}</b><br />{price(o)}</span>
                <span className="tip-via">{viaText(model, conn, o, hover.from)}</span>
              </div>
            ))}
          </div>
          <p className="tip-foot mono">Click for the full route</p>
        </>
      )
    }
  }

  useLayoutEffect(() => {
    const node = el.current
    if (!node || !points.length) return
    const place = () => {
      const canvas = map.getContainer()
      const pts = points.map((p) => map.project(p))
      const pad = 8
      const target = {
        left: Math.min(...pts.map((p) => p.x)) - pad,
        right: Math.max(...pts.map((p) => p.x)) + pad,
        top: Math.min(...pts.map((p) => p.y)) - pad,
        bottom: Math.max(...pts.map((p) => p.y)) + pad,
      }
      const pos = placeTip(target, { w: node.offsetWidth, h: node.offsetHeight }, { w: canvas.clientWidth, h: canvas.clientHeight }, getBlocked())
      node.style.left = `${Math.round(pos.left)}px`
      node.style.top = `${Math.round(pos.top)}px`
      node.style.visibility = 'visible'
    }
    place()
    map.on('move', place)
    return () => {
      map.off('move', place)
    }
  })

  if (!body) return null
  return (
    <div ref={el} key={hoverKey(hover)} className="tip" role="tooltip" style={{ visibility: 'hidden' }}>
      {body}
    </div>
  )
}
