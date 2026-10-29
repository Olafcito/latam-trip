import type { CSSProperties } from 'react'
import type { Airport, InOut, Way } from '../data/types'
import { clock, day, hours, kr, nextDayMark, timeUncertain } from '../lib/format'
import { nights, wayAxis, wayTrack, wayTrackLabel, type TrackWait } from '../lib/waytrack'
import { Home, Land, Moon, Sun, Transfer } from './icons'
import { FlightLinks } from './FlightLinks'
import { wayLinks } from '../lib/links'

// One way as a picture: the two ends with their big times, and under them the way on a time axis
// with every airport, its local times and the waits between flights.

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

/** A clock time on the axis, with "+1" when it falls on a later day than the way leaves. */
function Time({ t, start }: { t: string; start: string }) {
  const nd = nextDayMark(start, t)
  return (
    <span className="wx-tm">
      {clock(t)}
      {nd && <sup className="nd">{nd}</sup>}
      {timeUncertain(t) && <span className="warnmark" title="Time not known exactly">!</span>}
    </span>
  )
}

/** What a wait says above the line: a moon and the nights, or how long the change is. */
function WaitLabel({ p }: { p: TrackWait }) {
  if (p.type === 'night') return <span className="wx-w night"><Moon />{nights(p.nights)}</span>
  if (p.type === 'day_stop') return <span className="wx-w day"><Sun s={12} />{hours(p.hours)}</span>
  if (p.type === 'self_transfer') return <span className="wx-w xfer"><Transfer s={12} />{hours(p.hours)}</span>
  if (p.overnight) return <span className="wx-w night"><Moon />{hours(p.hours)}</span>
  return <span className="wx-w">{hours(p.hours)}</span>
}

function waitTitle(p: TrackWait): string {
  const what =
    p.type === 'night' ? `${nights(p.nights)} in ${p.code}${p.stay ? `, stay about ${kr(p.stay)}` : ''}`
    : p.type === 'day_stop' ? `Day stop in ${p.code}, ${hours(p.hours)}`
    : p.type === 'self_transfer' ? `Self-transfer in ${p.code}, ${hours(p.hours)} between separate tickets`
    : `${p.overnight ? 'Overnight change' : 'Change'} in ${p.code}, ${hours(p.hours)}`
  if (p.arrive && p.depart) return `${what}. Lands ${day(p.arrive)} ${clock(p.arrive)}, leaves ${day(p.depart)} ${clock(p.depart)}`
  return p.type === 'layover' ? `${what}. The times of the change are not in the data` : what
}

/**
 * The way on a time axis, after the flight timelines of the booking sites: every stretch is as long
 * as the hours it takes, with a floor so a short hop keeps room for its labels, so a night in Madrid fills the line the way it fills
 * the trip. Flights are solid bars with their time over them, waits sit between them in their own
 * style, and every airport is a point with its code and local time under it. A ruler above counts
 * the hours. Times inside one ticket are shares of its flight, marked "~".
 */
export function WayTrack({ way, airports, compact = false }: { way: Way; airports?: Record<string, Airport>; compact?: boolean }) {
  const t = wayTrack(way)
  const ax = wayAxis(t)
  const start = way.depart
  const pct = (f: number) => `${f * 100}%`
  const span = (p: { left: number; width: number }): CSSProperties => ({ left: pct(p.left), width: pct(p.width) })
  const dt = (s: string | null) => (s && !compact ? <small className="wx-dt">{day(s)}</small> : null)
  return (
    <div className={`wx${compact ? ' compact' : ''}`} role="img" aria-label={wayTrackLabel(way, airports)}>
      <div className="wx-ruler" aria-hidden="true">
        {ax.ticks.map((h) => <span key={h} style={{ left: pct(ax.x(h)) }}>{h}h</span>)}
      </div>
      <div className="wx-over" aria-hidden="true">
        {ax.parts.map((q, i) => { const p = q.part; return (
          <span key={i} className="wx-lab" data-k={p.kind} style={span(q)} title={p.kind === 'wait' ? waitTitle(p) : undefined}>
            {p.kind === 'fly' ? <span className="wx-dur">{p.approx ? '~' : ''}{hours(p.hours)}</span> : <WaitLabel p={p} />}
          </span>
        ) })}
      </div>
      <div className="wx-line" aria-hidden="true">
        {ax.ticks.map((h) => <i key={h} className="wx-tick" style={{ left: pct(ax.x(h)) }} />)}
        {ax.parts.map((q, i) => (
          <span key={i} className="wx-seg" data-k={q.part.kind} data-type={q.part.kind === 'wait' ? q.part.type : undefined} style={span(q)} />
        ))}
        <i className="wx-pt end" style={{ left: '0%' }} />
        {ax.parts.slice(1).map((q, i) => <i key={i} className="wx-pt" style={{ left: pct(q.left) }} />)}
        <i className="wx-pt end" style={{ left: '100%' }} />
      </div>
      <div className="wx-under" aria-hidden="true">
        <span className="wx-at start">
          <b>{t.start.code}</b>
          {t.start.time && <Time t={t.start.time} start={start} />}
          {dt(t.start.time)}
        </span>
        {ax.parts.map((q, i) => {
          const p = q.part
          if (p.kind !== 'wait') return null
          return (
            <span key={i} className="wx-wait" style={span(q)}>
              {/* wide: the landing under the left edge, the take-off under the right. Narrow: stacked in the middle */}
              <span className="wx-wide">
                {p.arrive && <span className="wx-at l"><Time t={p.arrive} start={start} /></span>}
                <b className="wx-code">{p.code}</b>
                {p.depart && <span className="wx-at r"><Time t={p.depart} start={start} /></span>}
              </span>
              <span className="wx-narrow">
                <b>{p.code}</b>
                {p.arrive && <Time t={p.arrive} start={start} />}
                {p.depart && <Time t={p.depart} start={start} />}
              </span>
            </span>
          )
        })}
        <span className="wx-at end">
          <b>{t.end.code}</b>
          {t.end.time && <Time t={t.end.time} start={start} />}
          {dt(t.end.time)}
        </span>
      </div>
    </div>
  )
}

export function WayCard({ way, inout, dir, compact = false }: { way: Way; inout: InOut; dir: 'in' | 'home'; compact?: boolean }) {
  const a = inout.airports
  const far = dir === 'in' ? way.to : way.from
  const city = a[far]?.name ?? far
  const carriers = [...new Set(way.timeline.flatMap((t) => (t.kind === 'flight' ? t.carriers : [])))]
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
      <WayTrack way={way} airports={a} compact={compact} />
      {!compact && (
        <footer className="wc-f">
          <span>{way.flights} {way.flights === 1 ? 'flight' : 'flights'}</span>
          <span>{hours(way.flying_hours)} in the air</span>
          {carriers.length > 0 && <span>{carriers.join(' · ')}</span>}
          <span className="spacer" />
          <span className="wc-price">{own != null ? kr(own) : 'on the return ticket'}</span>
        </footer>
      )}
      {!compact && <FlightLinks links={wayLinks(way, inout)} />}
    </section>
  )
}
