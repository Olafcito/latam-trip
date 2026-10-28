import type { FlightItem, InOut, StopItem, Way } from '../data/types'
import { clock, day, hours, kr, nextDayMark, timeUncertain } from '../lib/format'
import { Clock, Home, Land, Moon, Plane, Sun, Transfer } from './icons'

// One way as a picture: the two ends with their times, and a track scaled by hours where
// flights are bars and every stop is a chip with an icon. Text is kept to codes and numbers.

const MIN_FLY = 3 // flex-grow floor so a short flight stays visible
const MIN_STOP = 1.5

function Stamp({ s, from, big }: { s: string; from?: string; big?: boolean }) {
  if (!s) return <span className="wc-t">?</span>
  const nd = from ? nextDayMark(from, s) : ''
  return (
    <span className={`wc-t${big ? ' big' : ''}`}>
      <b>{clock(s)}</b>
      {nd && <sup className="nd">{nd}</sup>}
      {timeUncertain(s) && <span className="warnmark" title="Time not known exactly">!</span>}
      <small>{day(s)}</small>
    </span>
  )
}

type Seg =
  | { kind: 'fly'; hours: number; code: string | null; first: boolean }
  | { kind: 'conn'; hours: number; code: string; night: boolean }
  | { kind: 'stop'; item: StopItem }

/** Flights split around their layovers, stops between tickets kept as they are. */
function segments(w: Way): Seg[] {
  const out: Seg[] = []
  for (const it of w.timeline) {
    if (it.kind !== 'flight') {
      out.push({ kind: 'stop', item: it })
      continue
    }
    const f = it as FlightItem
    const lay = f.connections.reduce((a, c) => a + (c.layover_h ?? 0), 0)
    const legs = f.connections.length + 1
    const each = Math.max(0.5, (f.hours - lay) / legs)
    f.connections.forEach((c, i) => {
      out.push({ kind: 'fly', hours: each, code: c.airport, first: i === 0 })
      out.push({ kind: 'conn', hours: c.layover_h ?? 1, code: c.airport, night: f.overnight_layover && i === f.connections.length - 1 })
    })
    out.push({ kind: 'fly', hours: each, code: null, first: f.connections.length === 0 })
  }
  return out
}

function StopChip({ item }: { item: StopItem }) {
  const n = item.nights
  if (item.kind === 'night')
    return (
      <span className="wc-chip night" style={{ flexGrow: Math.max(MIN_STOP, item.hours / 2) }} title={`${n} ${n === 1 ? 'night' : 'nights'} in ${item.airport}${item.stay_estimate_dkk ? `, stay about ${kr(item.stay_estimate_dkk)}` : ''}`}>
        <Moon />
        <b>{item.airport}</b>
        <i>{n}n</i>
      </span>
    )
  if (item.kind === 'day_stop')
    return (
      <span className="wc-chip day" style={{ flexGrow: Math.max(MIN_STOP, item.hours / 2) }} title={`Day stop in ${item.airport}, ${hours(item.hours)}`}>
        <Sun />
        <b>{item.airport}</b>
        <i>{hours(item.hours)}</i>
      </span>
    )
  if (item.kind === 'self_transfer')
    return (
      <span className="wc-chip xfer" style={{ flexGrow: Math.max(MIN_STOP, item.hours / 2) }} title={`Self-transfer in ${item.airport}, ${hours(item.hours)} between separate tickets`}>
        <Transfer />
        <b>{item.airport}</b>
        <i>{hours(item.hours)}</i>
      </span>
    )
  return (
    <span className="wc-chip conn" style={{ flexGrow: Math.max(MIN_STOP, item.hours / 2) }} title={`Connection in ${item.airport}, ${hours(item.hours)}`}>
      <Clock />
      <b>{item.airport}</b>
      <i>{hours(item.hours)}</i>
    </span>
  )
}

export function WayCard({ way, inout, dir, compact = false }: { way: Way; inout: InOut; dir: 'in' | 'home'; compact?: boolean }) {
  const a = inout.airports
  const far = dir === 'in' ? way.to : way.from
  const city = a[far]?.name ?? far
  const carriers = [...new Set(way.timeline.flatMap((t) => (t.kind === 'flight' ? t.carriers : [])))]
  const segs = segments(way)
  const own = way.shared_ticket ? null : way.price_dkk
  return (
    <section className={`wc ${dir}${compact ? ' compact' : ''}`} aria-label={dir === 'in' ? `Way in to ${city}` : `Way home from ${city}`}>
      <header className="wc-h">
        <span className="wc-dir">{dir === 'in' ? 'In' : 'Home'}</span>
        <span className="wc-dur" title="Door to door">{hours(way.total_hours)}</span>
        {way.us_transit && <span className="wc-us" title="Passes through the United States, ESTA needed">US</span>}
      </header>
      <div className="wc-ends">
        <div className="wc-end">
          <span className="wc-city">{dir === 'in' ? <Home /> : <Land />}{dir === 'in' ? 'Copenhagen' : city}</span>
          <Stamp s={way.depart} big />
        </div>
        <div className="wc-end right">
          <span className="wc-city">{dir === 'in' ? city : 'Copenhagen'}{dir === 'in' ? <Land /> : <Home />}</span>
          <Stamp s={way.arrive} from={way.depart} big />
        </div>
      </div>
      <div className="wc-track" role="img" aria-label={`${way.flights} flights, ${hours(way.flying_hours)} in the air`}>
        {segs.map((s, i) => {
          if (s.kind === 'fly')
            return (
              <span key={i} className="wc-fly" style={{ flexGrow: Math.max(MIN_FLY, s.hours) }}>
                <Plane s={12} />
                {!compact && <i>{hours(s.hours)}</i>}
              </span>
            )
          if (s.kind === 'conn')
            return (
              <span key={i} className={`wc-chip conn${s.night ? ' night' : ''}`} style={{ flexGrow: Math.max(MIN_STOP, s.hours / 2) }} title={`${s.night ? 'Overnight layover' : 'Layover'} in ${s.code}, ${hours(s.hours)}`}>
                {s.night ? <Moon /> : <Clock />}
                <b>{s.code}</b>
                <i>{hours(s.hours)}</i>
              </span>
            )
          return <StopChip key={i} item={s.item} />
        })}
      </div>
      {!compact && (
        <footer className="wc-f">
          <span>{way.flights} {way.flights === 1 ? 'flight' : 'flights'}</span>
          <span>{hours(way.flying_hours)} in the air</span>
          {carriers.length > 0 && <span>{carriers.join(' · ')}</span>}
          <span className="spacer" />
          <span className="wc-price">{own != null ? kr(own) : 'on the return ticket'}</span>
        </footer>
      )}
    </section>
  )
}
