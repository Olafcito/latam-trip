import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as PE, type ReactNode } from 'react'
import type { AppData } from '../data/types'
import { countryColor, countryName } from '../lib/colors'
import { hours, kr } from '../lib/format'
import { travelUnknown, type Journey } from '../lib/journey'
import { deltas, differingStops, nightsGrid, sameAll } from '../lib/tripCompare'
import { axisOf, monthTicks } from '../lib/tripTimeline'
import { lowest } from '../lib/tripsort'
import type { Row } from '../screens/TripsScreen'
import { NightsBar } from './NightsBar'
import { Caret, Check, Close, Coin, Columns, Moon, Plane, Ticket } from './icons'

// Compare: two or three trips side by side, leading with where they differ. The totals with their
// difference to the cheapest, the nights as bars on one axis, the nights per country, flights and what
// is booked, the stops that are not in every trip and the costs. A line that is the same in every trip
// folds behind Same in all. On a wide screen it is a panel docked on the right, on a phone a bar at the
// foot that opens a full height sheet. Rebuilt from the 21st Drawer (wensity) on the app's tokens.

const WIDE = '(min-width: 900px)'

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(WIDE).matches)
  useEffect(() => {
    const m = window.matchMedia?.(WIDE)
    if (!m) return
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return wide
}

/** A value of one trip in a line: a number, its unpriced parts, or nothing when the trip has none. */
interface Cell {
  n: number | null
  unknown?: number
}

interface Metric {
  key: string
  label: ReactNode
  /** spoken and used in Same in all */
  name: string
  cells: Cell[]
  show: (c: Cell) => ReactNode
  /** lower is better, the lowest is set bold */
  best?: boolean
}

const nightsWord = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`

/** A price with its unpriced parts as a hollow coin. A part with no price is never shown as 0 kr. */
function money(c: Cell): ReactNode {
  const u = c.unknown ?? 0
  if (c.n == null || (c.n === 0 && u > 0)) {
    return <span className="cmp-unk" title={`${u || 1} not priced`}><Coin s={12} />{u > 1 ? u : null}<span className="sr">not priced</span></span>
  }
  return (
    <>
      {kr(c.n)}
      {u > 0 && <span className="cmp-unk" title={`${u} more not priced`}><Coin s={12} />{u}<span className="sr">more not priced</span></span>}
    </>
  )
}

const none = <span className="cmp-none" aria-label="none" title="None" />

export function Compare({ data, items, onOpen, onRemove, onClear }: {
  data: AppData
  items: Row[]
  onOpen: (j: Journey) => void
  onRemove: (id: string) => void
  onClear: () => void
}) {
  const wide = useWide()
  const [open, setOpen] = useState(false)
  const n = items.length

  const view = useMemo(() => {
    const ss = items.map((r) => r.s!)
    const lines = items.map((r) => r.line!)
    const axis = axisOf(lines)
    const totals = items.map((r) => r.total)
    const countries = nightsGrid(items.map((r) => ({ order: r.line!.segs.map((s) => s.country), days: r.s!.t.days_per_country })))
    const metrics: Metric[] = [
      ...countries.map((c): Metric => ({
        key: 'c-' + c.country,
        name: countryName(c.country),
        label: <><i className="cmp-dot" style={{ '--c': countryColor(c.country) } as CSSProperties} />{countryName(c.country)}</>,
        cells: c.nights.map((v) => ({ n: v })),
        show: (x) => (x.n == null ? none : nightsWord(x.n)),
      })),
      {
        key: 'flights', name: 'Flights', label: <><Plane s={12} />Flights</>,
        cells: ss.map((s) => ({ n: s.t.flights })), show: (x) => String(x.n), best: true,
      },
      {
        key: 'air', name: 'In the air', label: <><Plane s={12} />In the air</>,
        cells: ss.map((s) => ({ n: s.t.air_hours })), show: (x) => hours(x.n), best: true,
      },
      {
        key: 'booked', name: 'Booked', label: <><Ticket s={12} />Booked</>,
        cells: items.map((r) => ({ n: r.booked })), show: (x) => (x.n ? String(x.n) : none),
      },
      {
        key: 'stops', name: 'Stops', label: 'Stops',
        cells: ss.map((s) => ({ n: s.stops })), show: (x) => String(x.n),
      },
      {
        key: 'hubn', name: 'Nights at a hub', label: <><Moon s={12} />At a hub</>,
        cells: ss.map((s) => ({ n: s.t.hub_nights })), show: (x) => (x.n ? nightsWord(x.n) : none),
      },
      { key: 'long', name: 'Long haul tickets', label: 'Long haul tickets', cells: ss.map((s) => ({ n: s.t.tickets_dkk })), show: money, best: true },
      { key: 'reg', name: 'Regional flights', label: 'Regional flights', cells: ss.map((s) => ({ n: s.t.regional_flights_dkk, unknown: s.t.regional_unknown })), show: money, best: true },
      { key: 'ground', name: 'Ground', label: 'Ground', cells: ss.map((s) => ({ n: s.t.ground_dkk, unknown: s.t.ground_unknown })), show: money, best: true },
      { key: 'hub', name: 'Hub stays', label: 'Hub stays', cells: ss.map((s) => ({ n: s.t.hub_stay_dkk })), show: money, best: true },
      { key: 'cabin', name: 'Cabin bags', label: 'Cabin bags', cells: ss.map((s) => ({ n: s.t.cabin_bag_dkk })), show: money, best: true },
      { key: 'checked', name: 'Checked bags', label: 'Checked bags, not in the total', cells: ss.map((s) => ({ n: s.t.checked_bag_dkk })), show: money, best: true },
      { key: 'sb', name: 'Stays booked', label: 'Stays booked', cells: ss.map((s) => ({ n: s.t.stays_booked_dkk })), show: (x) => (x.n ? kr(x.n) : none) },
      { key: 'sp', name: 'Stays planned', label: 'Stays planned', cells: ss.map((s) => ({ n: s.t.stays_planned_dkk })), show: (x) => (x.n ? kr(x.n) : none) },
      { key: 'su', name: 'Stays not priced', label: 'Stays not priced', cells: ss.map((s) => ({ n: s.t.stays_unknown })), show: (x) => (x.n ? String(x.n) : none) },
    ]
    const differ = metrics.filter((m) => !sameAll(m.cells))
    const same = metrics.filter((m) => sameAll(m.cells))
    return {
      lines, axis, months: monthTicks(axis), totals, delta: deltas(totals), cheap: lowest(totals),
      stops: differingStops(ss.map((s) => s.route)), differ, same,
      unpriced: ss.map((s) => travelUnknown(s.t)),
    }
  }, [items])

  // Escape closes the phone sheet
  useEffect(() => {
    if (wide || !open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [wide, open])

  const cols = { '--n': n } as CSSProperties

  const body = (
    <div className="cmp-body" style={cols}>
      <div className="cmp-legend">
        {items.map((r, i) => (
          <div key={r.j.id} className="cmp-col" data-i={i}>
            <div className="cmp-colhead">
              <i className="cmp-sw" aria-hidden />
              <button type="button" className="tt-icon cmp-x" onClick={() => onRemove(r.j.id)} aria-label={`Take ${r.j.name} out of compare`} title="Take out"><Close s={12} /></button>
            </div>
            <p className="cmp-name" title={r.j.name}>{r.j.name}</p>
            <p className="cmp-total" title="Travel: the long haul tickets, regional flights, ground legs, hub stays and cabin bags">
              {kr(r.total)}
            </p>
            <p className="cmp-delta">
              {view.cheap.has(i) ? <span className="cmp-cheap" title="Cheapest"><Check s={12} />cheapest</span>
                : view.delta[i] != null && view.delta[i]! > 0 ? <span>+{kr(view.delta[i])}</span> : null}
              {view.unpriced[i] > 0 && (
                <span className="cmp-unk" title={`${view.unpriced[i]} ${view.unpriced[i] === 1 ? 'part has' : 'parts have'} no price yet`}>
                  <Coin s={12} />{view.unpriced[i]}<span className="sr">not priced</span>
                </span>
              )}
            </p>
            <button type="button" className="btn small cmp-open" onClick={() => onOpen(r.j)}>Open<Caret dir="r" s={12} /></button>
          </div>
        ))}
      </div>

      <section className="cmp-sec" aria-label="Nights">
        {items.map((r, i) => (
          <div key={r.j.id} className="cmp-line" data-i={i}>
            <i className="cmp-sw" aria-hidden />
            <NightsBar line={view.lines[i]} axis={view.axis} months={view.months} from={r.s!.route[0]} to={r.s!.route[r.s!.route.length - 1]} />
          </div>
        ))}
      </section>

      {view.stops.some((x) => x.length) && (
        <section className="cmp-sec" aria-label="Stops not in every trip">
          <h4 className="cmp-h">Stops not in every trip</h4>
          <div className="cmp-grid">
            {view.stops.map((list, i) => (
              <div key={i} className="cmp-chips" data-i={i}>
                {list.length ? list.map((p) => <span key={p} className="cmp-chip">{p}</span>) : none}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="cmp-sec" aria-label="Where they differ">
        {view.differ.map((m) => <MetricRow key={m.key} m={m} />)}
      </section>

      {view.same.length > 0 && (
        <details className="cmp-same">
          <summary><Caret dir="r" s={12} />Same in all<span className="cmp-count">{view.same.length}</span></summary>
          <dl>
            {view.same.map((m) => (
              <div key={m.key} className="cmp-sameline">
                <dt>{m.label}</dt>
                <dd>{m.show(m.cells[0])}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  )

  const head = (
    <div className="cmp-head">
      <h3 className="cmp-title"><Columns s={15} />Compare</h3>
      <span className="cmp-count" aria-label={`${n} of 3 trips`}>{n} of 3</span>
      <button type="button" className="btn link small cmp-clear" onClick={() => { setOpen(false); onClear() }}>Clear</button>
      {!wide && <button type="button" className="tt-icon" onClick={() => setOpen(false)} aria-label="Close compare" title="Close"><Close s={14} /></button>}
    </div>
  )

  if (wide) {
    return <aside className="cmp cmp-dock" aria-label="Compare trips">{head}{body}</aside>
  }
  return (
    <>
      <button type="button" className="cmp-bar" onClick={() => setOpen(true)} aria-label={`Compare ${n} trips`}>
        <Columns s={15} />
        <span className="cmp-bar-sw" style={cols}>{items.map((r, i) => <i key={r.j.id} className="cmp-sw" data-i={i} />)}</span>
        <span className="cmp-bar-t">Compare</span>
        <span className="cmp-count">{n} of 3</span>
        <Caret dir="r" s={14} />
      </button>
      {open && <Sheet onClose={() => setOpen(false)} head={head}>{body}</Sheet>}
    </>
  )
}

function MetricRow({ m }: { m: Metric }) {
  const best = m.best ? lowest(m.cells.map((c) => (c.unknown ? null : c.n))) : new Set<number>()
  return (
    <div className="cmp-metric">
      <h4 className="cmp-h">{m.label}</h4>
      <div className="cmp-grid">
        {m.cells.map((c, i) => (
          <span key={i} className="cmp-v" data-i={i} data-best={best.has(i) || undefined}>{m.show(c)}</span>
        ))}
      </div>
    </div>
  )
}

/** The phone sheet: full height, a grabber, a scrim. Drag down or a flick closes it, Escape too. */
function Sheet({ onClose, head, children }: { onClose: () => void; head: ReactNode; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; t: number; dy: number; v: number } | null>(null)

  useEffect(() => {
    panel.current?.focus({ preventScroll: true })
    const html = document.documentElement
    const before = html.style.overflow
    html.style.overflow = 'hidden'
    return () => { html.style.overflow = before }
  }, [])

  const set = (dy: number, animate: boolean) => {
    const el = panel.current
    if (!el) return
    el.style.transition = animate ? '' : 'none'
    el.style.transform = dy ? `translateY(${dy}px)` : ''
  }
  const down = (e: PE<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { y: e.clientY, t: e.timeStamp, dy: 0, v: 0 }
  }
  const move = (e: PE<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dy = e.clientY - d.y
    const dt = Math.max(1, e.timeStamp - d.t)
    d.v = (dy - d.dy) / dt
    d.dy = dy
    d.t = e.timeStamp
    // above the rest position it resists, below it follows the finger
    set(dy < 0 ? dy / 4 : dy, false)
  }
  const up = () => {
    const d = drag.current
    drag.current = null
    if (!d) return
    if (d.dy > 120 || d.v > 0.6) onClose()
    else set(0, true)
  }

  return (
    <div className="cmp-sheetwrap">
      <div className="cmp-scrim" onClick={onClose} aria-hidden />
      <div ref={panel} className="cmp cmp-sheet" role="dialog" aria-modal="true" aria-label="Compare trips" tabIndex={-1}>
        <div className="cmp-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="cmp-grabber" aria-hidden />
          {head}
        </div>
        {children}
      </div>
    </div>
  )
}
