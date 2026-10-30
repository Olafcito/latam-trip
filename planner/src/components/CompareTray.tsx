import type { ReactNode } from 'react'
import type { AppData } from '../data/types'
import { day, hours, kr } from '../lib/format'
import type { Journey } from '../lib/journey'
import { lowest } from '../lib/tripsort'
import type { Summary } from '../lib/tripsummary'
import { Close } from './icons'

// The compare tray: up to three saved trips side by side, docked to the bottom edge of the Trips
// home. A spec sheet of hairline rows, the lowest value of a priced line marked with an amber dot.
// Ported from the 21st Spec Sheet (isaiahbjork) and the bottom Drawer (wensity) in plain React.

export interface CompareItem { j: Journey; s: Summary | null }

interface Line {
  label: string
  /** the text of a cell, or null when the value is unknown */
  text: (s: Summary) => string | null
  /** the number the amber dot compares, lower is better. Lines without one are never marked. */
  value?: (s: Summary) => number | null
  /** a count, set right aligned like the prices */
  count?: boolean
}

const known = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? null : n)

const LINES = (data: AppData): Line[] => {
  const airport = (code: string) => data.inout.airports[code]?.name ?? code
  return [
    { label: 'Route', text: (s) => s.route.join(' → ') || null },
    { label: 'Lands', text: (s) => `${airport(s.wi.to)}, ${day(s.wi.arrive)}` },
    { label: 'Flies home', text: (s) => `${airport(s.wh.from)}, ${day(s.wh.depart)}` },
    { label: 'Long-haul tickets', text: (s) => kr(s.t.tickets_dkk), value: (s) => known(s.t.tickets_dkk) },
    { label: 'Regional flights', text: (s) => kr(s.t.regional_flights_dkk), value: (s) => known(s.t.regional_flights_dkk) },
    { label: 'Cabin-bag fees', text: (s) => (s.t.cabin_bag_dkk == null ? null : kr(s.t.cabin_bag_dkk)), value: (s) => known(s.t.cabin_bag_dkk) },
    { label: 'Checked-bag fees', text: (s) => (s.t.checked_bag_dkk == null ? null : kr(s.t.checked_bag_dkk)), value: (s) => known(s.t.checked_bag_dkk) },
    { label: 'Hub nights', text: (s) => String(s.t.hub_nights), count: true },
    { label: 'Hub stay est.', text: (s) => (s.t.hub_stay_dkk == null ? null : kr(s.t.hub_stay_dkk)), value: (s) => known(s.t.hub_stay_dkk) },
    {
      label: 'Ground transport',
      text: (s) => (s.t.ground_unknown ? `${kr(s.t.ground_dkk)}, some not priced` : kr(s.t.ground_dkk)),
      value: (s) => (s.t.ground_unknown ? null : s.t.ground_dkk),
    },
    { label: 'All in', text: (s) => (s.partial ? `${kr(s.total)}, some not priced` : kr(s.total)), value: (s) => (s.partial ? null : s.total) },
    { label: 'Nights there', text: (s) => String(s.nights), count: true },
    { label: 'Stops', text: (s) => String(s.stops), count: true },
    { label: 'Flights', text: (s) => String(s.t.flights), value: (s) => s.t.flights },
    { label: 'Hours in the air', text: (s) => hours(s.t.air_hours), value: (s) => known(s.t.air_hours) },
  ]
}

const Unknown = () => (
  <span className="cmp-q">not known</span>
)

/** "A", "A and B", "A, B and C" */
const listOf = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`)

export function CompareTray({ data, items, onClear }: { data: AppData; items: CompareItem[]; onClear: () => void }) {
  const shown = items.slice(0, 3)
  const lines = LINES(data)
  const cell = (line: Line, s: Summary | null, best: boolean): ReactNode => {
    const text = s ? line.text(s) : null
    if (text == null) return <Unknown />
    // a ", some not priced" tail marks a floor, faint like any unknown
    const TAIL = ', some not priced'
    const floor = text.endsWith(TAIL)
    return (
      <>
        {best && <span className="cmp-best" aria-hidden="true" />}
        {floor ? <>{text.slice(0, -TAIL.length)} <span className="cmp-q">some not priced</span></> : text}
        {best && <span className="sr"> (lowest)</span>}
      </>
    )
  }

  return (
    <section className="tray" aria-labelledby="tray-title">
      <header className="tray-head">
        <h2 id="tray-title" className="tray-title">Compare</h2>
        <span className="tray-count mono">{shown.length} of 3</span>
        <button type="button" className="btn link small tray-clear" onClick={onClear} aria-label="Clear compare">
          <Close />
          <span>Clear</span>
        </button>
      </header>
      <div className="tray-body" role="region" aria-label="Compared trips" tabIndex={0}>
        <table className="cmp" style={{ ['--cols' as string]: shown.length }}>
          <caption className="sr">Comparing {listOf(shown.map((x) => x.j.name))}</caption>
          <colgroup>
            <col className="cmp-labelcol" />
            {shown.map((x) => <col key={x.j.id} />)}
          </colgroup>
          <thead>
            <tr>
              <td />
              {shown.map(({ j, s }) => (
                <th key={j.id} scope="col">
                  <span className="cmp-name">{j.name}</span>
                  <span className="cmp-detail mono">{s ? kr(s.total) : 'not planned'}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const best = line.value ? lowest(shown.map(({ s }) => (s ? line.value!(s) : null))) : new Set<number>()
              const numeric = !!line.value || line.count
              return (
                <tr key={line.label}>
                  <th scope="row">{line.label}</th>
                  {shown.map(({ j, s }, i) => (
                    <td key={j.id} className={numeric ? 'num' : undefined}>
                      {cell(line, s, best.has(i))}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}
