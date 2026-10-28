import type { InOut, Way } from '../data/types'
import { clock, day, dayDiff, hours, kr, observed, STOP_LABEL, timeUncertain } from '../lib/format'

function Unknown({ what }: { what: string }) {
  return <span className="q" title={`${what} not shown by the booking site`}>?</span>
}

function When({ a, b }: { a: string; b: string }) {
  const nd = dayDiff(a, b)
  return (
    <>
      {day(a)} {clock(a)} to {nd > 0 ? day(b) + ' ' : ''}
      {clock(b)}
      {nd > 0 && <span className="nd">+{nd}</span>}
      {timeUncertain(b) && <span className="warnmark" title="Arrival logged as 23:59: time uncertain"> (time uncertain)</span>}
    </>
  )
}

/** One direction as rows: each flight, its sold connections, and each stop between tickets. */
export function WayTimeline({ data, way }: { data: InOut; way: Way }) {
  const ap = (c: string) => data.airports[c]?.name ?? c
  const dir = way.direction
  return (
    <div className="way">
      <h4 className={dir}>
        {dir === 'in' ? 'Way in' : 'Way home'}
        <span>
          {hours(way.total_hours)} door to door · {hours(way.flying_hours)} flying · {way.flights} flights
        </span>
      </h4>
      <table className="tl">
        <tbody>
          {way.timeline.map((it, i) => {
            if (it.kind === 'flight') {
              const t = data.tickets[it.ticket]
              const rows = [
                <tr key={i}>
                  <td className="k">Flight</td>
                  <td className="t"><When a={it.depart} b={it.arrive} /></td>
                  <td>
                    {ap(it.from)} to {ap(it.to)}
                    <span className="sub">
                      {it.carriers.join(', ') || 'Carrier ?'}
                      {it.flight_numbers?.length ? ' · ' + it.flight_numbers.join(', ') : ''}
                      {t ? ` · ${kr(t.price_dkk)} seen ${observed(t.observed_at)}` : ''}
                    </span>
                  </td>
                  <td className="t">{hours(it.hours)}</td>
                </tr>,
              ]
              it.connections.forEach((c, k) => {
                rows.push(
                  <tr key={`${i}c${k}`} className="conn">
                    <td className="k">Connection</td>
                    <td className="t" />
                    <td>{ap(c.airport)} ({c.airport}){it.overnight_layover ? ', overnight' : ''}</td>
                    <td className="t">{c.layover_h == null ? <Unknown what="Layover time" /> : hours(c.layover_h)}</td>
                  </tr>,
                )
              })
              return rows
            }
            return (
              <tr key={i} className={'stop ' + it.kind}>
                <td className="k">{STOP_LABEL[it.kind] ?? it.kind}</td>
                <td className="t"><When a={it.arrive} b={it.depart} /></td>
                <td>
                  {ap(it.airport)}
                  <span className="sub">
                    {it.nights ? `${it.nights} ${it.nights === 1 ? 'night' : 'nights'} · stay est. ${kr(it.stay_estimate_dkk)}` : it.same_ticket ? 'same ticket' : 'separate tickets, recheck bags'}
                  </span>
                </td>
                <td className="t">{hours(it.hours)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
