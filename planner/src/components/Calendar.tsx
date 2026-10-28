import type { AppData, Way } from '../data/types'
import type { Journey, Schedule } from '../lib/journey'
import { nodeName } from '../lib/journey'
import { day, dayTime, hours as fmtHours } from '../lib/format'
import { dateRange } from '../lib/time'
import { countryColor, countryName } from '../lib/colors'

const START = '2026-12-01'
const END = '2027-02-05'

function pos(stamp: string): number {
  const days = dateRange(START, END).length
  const d = Date.UTC(+stamp.slice(0, 4), +stamp.slice(5, 7) - 1, +stamp.slice(8, 10), +stamp.slice(11, 13) || 0, +stamp.slice(14, 16) || 0)
  const s = Date.UTC(2026, 11, 1)
  return Math.max(0, Math.min(100, ((d - s) / 86400000 / days) * 100))
}

interface Bar { left: number; width: number; cls: string; color?: string; label: string; title: string }

function wayBars(data: AppData, w: Way): Bar[] {
  return w.timeline.map((it) => {
    const a = it.kind === 'flight' ? it.depart : it.arrive
    const b = it.kind === 'flight' ? it.arrive : it.depart
    const left = pos(a)
    const title = it.kind === 'flight'
      ? `${it.from} to ${it.to}: ${dayTime(it.depart)} to ${dayTime(it.arrive)}, ${fmtHours(it.hours)}`
      : `${data.inout.airports[it.airport]?.name ?? it.airport}: ${it.kind.replace('_', ' ')} ${dayTime(it.arrive)} to ${dayTime(it.depart)}`
    return { left, width: Math.max(0.3, pos(b) - left), cls: it.kind === 'flight' ? 'fl' : 'hub', label: it.kind === 'flight' ? '' : it.airport, title }
  })
}

/** Horizontal calendar 1 Dec to 5 Feb: flights and hub stops, stays per place coloured by country, hops. */
export function Calendar({ data, journey, sched, wi, wh }: { data: AppData; journey: Journey; sched: Schedule; wi: Way; wh: Way }) {
  const days = dateRange(START, END)
  const stays: Bar[] = sched.places.map((sp, i) => {
    const next = sched.places[i + 1]
    const end = next ? sched.places[i + 1] && journey.places[i + 1].hop?.flight
      ? sp.leaveDate + 'T' + journey.places[i + 1].hop!.flight!.depart.slice(11, 16)
      : sp.leaveDate + 'T08:00'
      : wh.depart
    const node = data.map.nodes.find((n) => n.id === sp.node)
    const c = node?.country ?? data.inout.airports[sp.node]?.country ?? '?'
    const left = pos(sp.arrive)
    return {
      left, width: Math.max(0.4, pos(end) - left), cls: 'stay', color: countryColor(c),
      label: nodeName(data.map, data.inout, sp.node),
      title: `${nodeName(data.map, data.inout, sp.node)}, ${countryName(c)}: ${dayTime(sp.arrive)} to ${dayTime(end)}, ${sp.nights} nights`,
    }
  })
  const hops: Bar[] = journey.places.flatMap((p, i) => {
    if (!p.hop || i === 0) return []
    const dep = sched.places[i - 1].leaveDate + 'T' + (p.hop.flight ? p.hop.flight.depart.slice(11, 16) : '08:00')
    const left = pos(dep)
    return [{ left, width: Math.max(0.3, pos(sched.places[i].arrive) - left), cls: 'hop', label: '', title: `${p.hop.mode}: ${p.hop.from} to ${p.hop.to}, ${fmtHours(p.hop.hours)}` }]
  })
  const flights = [...wayBars(data, wi), ...wayBars(data, wh)]

  const row = (label: string, bars: Bar[]) => (
    <div className="cal-row">
      <span className="cal-lbl">{label}</span>
      {bars.map((b, i) => (
        <div key={i} className={'cal-bar ' + b.cls} style={{ left: b.left + '%', width: b.width + '%', background: b.color }} title={b.title}>{b.width > 4 ? b.label : ''}</div>
      ))}
    </div>
  )

  return (
    <div className="card pad cal">
      <div className="row" style={{ marginBottom: 10 }}>
        <h3 className="h3" style={{ margin: 0 }}>Calendar, 1 Dec to 5 Feb</h3>
        <span className="spacer" />
        <span className="small muted">Hover a bar for times</span>
      </div>
      <div className="cal-in">
        <div className="cal-days" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
          {days.map((d) => {
            const first = d.endsWith('-01')
            const label = first ? (d.slice(5, 7) === '12' ? 'Dec' : d.slice(5, 7) === '01' ? 'Jan' : 'Feb') : Number(d.slice(8)) % 7 === 1 ? String(Number(d.slice(8))) : ''
            return <span key={d} className={first ? 'm' : ''} title={d}>{label}</span>
          })}
        </div>
        <div style={{ height: 14 }} />
        {row('Flights and hub stops', flights)}
        <div style={{ height: 14 }} />
        {row('Stays', stays)}
        <div style={{ height: 6 }} />
        {row('', hops)}
        <div className="small muted" style={{ marginTop: 8 }}>
          Day 1 on the ground {day(sched.firstDay)} · flight home {dayTime(sched.homeDepart)} · planned end {day(sched.endDate)}
        </div>
      </div>
    </div>
  )
}
