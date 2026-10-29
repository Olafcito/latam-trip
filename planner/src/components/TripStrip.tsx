import type { CSSProperties, JSX, ReactNode } from 'react'
import { countryColor } from '../lib/colors'
import type { StripLayout } from '../lib/strip'
import './TripStrip.css'

// One trip drawn on a shared time axis. The width follows the container: every x is a percent of
// the domain, and each mark that has a size of its own (arcs, glyphs, names) sits in a nested svg
// placed at that percent and drawn in px from there. No DOM measuring: whether a name fits inside
// its stay is estimated from the mono advance and a nominal strip width.

const DAY = 86400000

/** Vertical geometry in px per size. `nominal` is the strip width the name estimate assumes. */
const GEO = {
  row: { h: 28, top: 11, bottom: 25, font: 10.5, hop: 12, rise: 7, tick: 6, end: 22, endRise: 8, moon: 8, plane: 10, nominal: 560 },
  full: { h: 72, top: 24, bottom: 44, font: 11, hop: 16, rise: 9, tick: 8, end: 34, endRise: 11, moon: 9, plane: 13, nominal: 880 },
} as const
/** full size: label lanes above and below the strip, and the week dates under them */
const LANE_ABOVE = 10
const LANE_BELOW = 57
const DATE_LINE = 70
/** Inter advances under 0.6 em per character, so 0.6 errs toward a name not fitting */
const ADVANCE = 0.6
const PAD = 5

const MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'
const PLANE =
  'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z'

const pct = (f: number) => `${(f * 100).toFixed(3)}%`
const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const nights = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`

/** A point on the axis that children draw around in px. */
const At = ({ f, className, children }: { f: number; className?: string; children: ReactNode }) => (
  <svg x={pct(f)} y={0} overflow="visible" className={className}>
    {children}
  </svg>
)

/** An authored 24 unit glyph centred on (x, y), s px wide. */
const Glyph = ({ x, y, s, d, className, turn = 0 }: { x: number; y: number; s: number; d: string; className: string; turn?: number }) => (
  <svg x={x - s / 2} y={y - s / 2} width={s} height={s} viewBox="0 0 24 24" overflow="visible" className={className}>
    <path d={d} transform={turn ? `rotate(${turn} 12 12)` : undefined} />
  </svg>
)

/** The split mark for a self transfer: the arc breaks and two short bars stand at the break. */
const Split = ({ x, y }: { x: number; y: number }) => (
  <>
    <circle className="knock" cx={x} cy={y} r={2.2} />
    <path className="split" d={`M${x - 1.8} ${y - 2.2}v4.4M${x + 1.8} ${y - 2.2}v4.4`} />
  </>
)

interface Placed { k: number; x: number; anchor: 'start' | 'middle' | 'end'; lane: number; mid: number }

/** full size: names that do not fit inside their stay go below the strip, or above it when below is taken. */
function laneLabels(names: string[], spans: [number, number][], inside: boolean[], width: number, cw: number): Placed[] {
  const lastRight = [-Infinity, -Infinity] // below, above
  const out: Placed[] = []
  names.forEach((name, k) => {
    if (inside[k]) return
    const [a, b] = spans[k]
    const mid = (a + b) / 2
    const tw = name.length * cw
    let anchor: Placed['anchor'] = 'middle'
    let x = mid
    let left = mid * width - tw / 2
    if (left < 0) { anchor = 'start'; x = a; left = a * width }
    else if (mid * width + tw / 2 > width) { anchor = 'end'; x = b; left = b * width - tw }
    const free = lastRight.findIndex((r) => left >= r + 14)
    const lane = free >= 0 ? free : lastRight[0] <= lastRight[1] ? 0 : 1
    lastRight[lane] = left + tw
    out.push({ k, x, anchor, lane, mid })
  })
  return out
}

/** Monday ticks, every week or every few weeks so the dates keep about 56px apart. */
function weekTicks(d0: number, d1: number, width: number): number[] {
  const perWeek = (7 * DAY * width) / (d1 - d0)
  const step = Math.max(1, Math.ceil(56 / perWeek)) * 7 * DAY
  let t = Math.ceil(d0 / DAY) * DAY
  t += ((8 - new Date(t).getUTCDay()) % 7) * DAY
  const out: number[] = []
  for (; t <= d1; t += step) out.push(t)
  return out
}

export interface TripStripProps {
  layout: StripLayout
  domain: [number, number]
  size: 'row' | 'full'
  label: string
  /** the strip's usual width in px, for deciding which names fit. Defaults to 560 for a row and 880 full, on the low side so a wider strip only adds room. */
  width?: number
}

export function TripStrip({ layout, domain, size, label, width }: TripStripProps): JSX.Element {
  const g = GEO[size]
  const w = width ?? g.nominal
  const [d0, d1] = domain
  const span = Math.max(1, d1 - d0)
  const fx = (t: number) => Math.min(1, Math.max(0, (t - d0) / span))
  const cw = g.font * ADVANCE
  const tall = g.bottom - g.top

  const spans = layout.stays.map((s) => [fx(s.start), fx(s.end)] as [number, number])
  const inside = layout.stays.map((s, k) => (spans[k][1] - spans[k][0]) * w >= s.name.length * cw + 2 * PAD)
  const lanes = size === 'full' ? laneLabels(layout.stays.map((s) => s.name), spans, inside, w, cw) : []
  const ticks = size === 'full' ? weekTicks(d0, d1, w) : []
  const arcY = g.top - g.endRise
  const land = fx(layout.land)
  const leave = fx(layout.leave)

  return (
    <svg className={`strip ${size}`} width="100%" height={g.h} role="img" aria-label={label} overflow="visible">
      {ticks.map((t) => {
        const f = fx(t)
        return (
          <g key={t} className="week">
            <line x1={pct(f)} x2={pct(f)} y1={g.bottom + 1} y2={DATE_LINE - 9} />
            <text x={pct(f)} y={DATE_LINE} textAnchor={f < 0.03 ? 'start' : f > 0.97 ? 'end' : 'middle'}>
              {dateFmt.format(t).toLowerCase()}
            </text>
          </g>
        )
      })}

      <line className="track" x1="0" x2="100%" y1={g.bottom + 0.5} y2={g.bottom + 0.5} />

      {layout.stays.map((s, k) => {
        const [a, b] = spans[k]
        const c = { '--c': countryColor(s.country) } as CSSProperties
        const tip = <title>{`${s.name}, ${nights(s.nights)}`}</title>
        // a stay too short to see still leaves a 2px mark in its colour
        if ((b - a) * w < 2) {
          return (
            <At key={k} f={a} className="stay thin">
              <g style={c}>
                {tip}
                <rect className="edge" x={-1} y={g.top} width={2} height={tall} />
              </g>
            </At>
          )
        }
        return (
          <svg key={k} x={pct(a)} y={g.top} width={pct(b - a)} height={tall} className="stay" style={c}>
            {tip}
            <rect className="tint" width="100%" height="100%" />
            <rect className="edge" width="100%" height={2} />
            <rect className="gap" width={1} height="100%" />
            {inside[k] && (
              <text className="name" x={PAD} y={tall / 2 + 1 + g.font * 0.36} style={{ fontSize: g.font }}>
                {s.name}
              </text>
            )}
          </svg>
        )
      })}

      {lanes.map((p) => (
        <g key={p.k} className="lane" style={{ '--c': countryColor(layout.stays[p.k].country) } as CSSProperties}>
          {p.lane === 0 && <line className="lead" x1={pct(p.mid)} x2={pct(p.mid)} y1={g.bottom + 1} y2={g.bottom + 4} />}
          <text x={pct(p.x)} y={p.lane === 0 ? LANE_BELOW : LANE_ABOVE} textAnchor={p.anchor} style={{ fontSize: g.font }}>
            {layout.stays[p.k].name}
          </text>
        </g>
      ))}

      <g className="hops">
        {layout.hops.map((h, k) => {
          const cls = `hop ${h.mode === 'flight' ? 'fly' : h.mode === 'boat' ? 'boat' : 'ground'}${h.known ? '' : ' unknown'}`
          return (
            <At key={k} f={fx(h.at)} className={cls}>
              {h.mode === 'flight' ? (
                <>
                  <path className="arc" d={`M${-g.hop / 2} ${g.top}Q0 ${g.top - 2 * g.rise} ${g.hop / 2} ${g.top}`} />
                  {h.selfTransfer && <Split x={0} y={g.top - g.rise} />}
                  {h.night && <Glyph className="moon" d={MOON} s={g.moon} x={g.hop / 2 + g.moon / 2 + 1} y={g.top - g.rise} />}
                </>
              ) : (
                <line className="tick" x1={0} x2={0} y1={g.top - g.tick} y2={g.top} />
              )}
            </At>
          )
        })}
      </g>

      <g className="ends">
        <At f={land} className="end in">
          <path
            className="arc"
            d={`M${-g.end} ${arcY}C${-g.end * 0.45} ${arcY} ${-g.end * 0.15} ${g.top - 1} 0 ${g.top}`}
          />
          <Glyph className="plane" d={PLANE} s={g.plane} x={-g.end - g.plane / 2 - 1} y={arcY} turn={45} />
          {layout.wayIn.selfTransfer && <Split x={-g.end * 0.35} y={g.top - g.endRise / 2 - 0.4} />}
          {layout.wayIn.night && <Glyph className="moon" d={MOON} s={g.moon} x={g.moon / 2 + 3} y={arcY + 1} />}
        </At>
        <At f={leave} className="end home">
          <path className="arc" d={`M0 ${g.top}C${g.end * 0.15} ${g.top - 1} ${g.end * 0.45} ${arcY} ${g.end} ${arcY}`} />
          <Glyph className="plane" d={PLANE} s={g.plane} x={g.end + g.plane / 2 + 1} y={arcY} turn={45} />
          {layout.wayHome.selfTransfer && <Split x={g.end * 0.35} y={g.top - g.endRise / 2 - 0.4} />}
          {layout.wayHome.night && <Glyph className="moon" d={MOON} s={g.moon} x={g.end + g.plane + g.moon / 2 + 4} y={arcY} />}
        </At>
      </g>
    </svg>
  )
}
