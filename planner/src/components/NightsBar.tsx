import type { CSSProperties } from 'react'
import type { AppData } from '../data/types'
import { countryColor, countryName } from '../lib/colors'
import { day, shortPlace } from '../lib/format'
import { nodeName, type Journey } from '../lib/journey'
import { at, timeline, type Axis, type Line } from '../lib/tripTimeline'
import type { Summary } from '../lib/tripsummary'
import { Plane } from './icons'

// A trip as a bar of its nights on an axis shared with the other trips: a segment per country as wide as
// its nights, the free nights before the flight home hatched, a plane where a flight brings you in. The
// landing city and day sit under the left end in the start green, the city you fly home from and its day
// under the right end in the end orange.

/** The bar of a trip, from its schedule. */
export function tripLine(data: AppData, j: Journey, s: Summary): Line {
  const countryOf = (n: string) => data.map.nodes.find((x) => x.id === n)?.country ?? data.inout.airports[n]?.country ?? '?'
  return timeline({
    places: s.sched.places,
    modes: j.places.map((p, i) => (i > 0 ? p.hop?.mode ?? null : null)),
    free: s.sched.free,
    firstDay: s.sched.firstDay,
    homeDepart: s.sched.homeDepart,
    countryOf,
    nameOf: (n) => shortPlace(nodeName(data.map, data.inout, n)),
  })
}

const pct = (x: number) => `${(Math.max(0, Math.min(1, x)) * 100).toFixed(3)}%`
const nightsWord = (n: number) => `${n} ${n === 1 ? 'night' : 'nights'}`

interface Props {
  line: Line
  axis: Axis
  /** the landing city and the city of the flight home, under the ends */
  from?: string
  to?: string
  /** the first of each month, as faint lines */
  months?: { day: string; x: number }[]
}

export function NightsBar({ line, axis, from, to, months = [] }: Props) {
  const left = at(axis, line.start)
  const right = at(axis, line.end)
  const said = line.segs.filter((s) => s.nights > 0).map((s) => `${countryName(s.country)} ${s.free ? `${nightsWord(s.nights)} free` : nightsWord(s.nights)}`).join(', ')
  return (
    <div className="nb">
      <div className="nb-bar" role="img" aria-label={said || 'No nights planned'}>
        {months.map((m) => <span key={m.day} className="nb-month" style={{ left: pct(m.x) }} />)}
        <span className="nb-span" style={{ left: pct(left), width: pct(right - left) }} />
        {line.segs.map((s, i) => {
          const w = s.nights / axis.days
          const title = s.free
            ? `${nightsWord(s.nights)} in ${countryName(s.country)} that no stop holds, before the flight home`
            : `${countryName(s.country)}, ${nightsWord(s.nights)}${s.stops.length ? `\n${s.stops.join(', ')}` : ''}`
          return (
            <span
              key={i}
              className="nb-seg"
              data-free={s.free || undefined}
              data-pass={s.nights === 0 || undefined}
              style={{ left: pct(at(axis, s.from)), width: s.nights ? pct(w) : undefined, '--c': countryColor(s.country) } as CSSProperties}
              title={title}
            >
              {!s.free && s.nights > 0 && w >= 0.055 && <span className="nb-code">{s.country}</span>}
            </span>
          )
        })}
        {line.flights.map((d, i) => (
          <span key={i} className="nb-fly" style={{ left: pct(at(axis, d)) }} title={`Flight on ${day(d)}`}><Plane s={9} /></span>
        ))}
      </div>
      {(from || to) && (
        <div className="nb-ends" style={{ paddingLeft: pct(left), paddingRight: pct(1 - right) }}>
          {from && <span className="nb-end in"><i aria-hidden />{from}<b>{day(line.start)}</b></span>}
          {to && <span className="nb-end home">{to}<b>{day(line.end)}</b><i aria-hidden /></span>}
        </div>
      )}
    </div>
  )
}
