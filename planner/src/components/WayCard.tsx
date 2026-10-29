import { Fragment, type ReactNode } from 'react'
import type { Airport, InOut, Way } from '../data/types'
import { clock, day, hours, kr, nextDayMark, timeUncertain } from '../lib/format'
import { nights, wayTrack, wayTrackLabel, type TrackWait } from '../lib/waytrack'
import { Home, Land, Moon, Sun, Transfer } from './icons'
import { useEdgeFade } from './useEdgeFade'
import { FlightLinks } from './FlightLinks'
import { wayLinks } from '../lib/links'

// One way as a picture: the two ends with their big times, and under them the way as a transit line
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

/** A clock time under a node, with "+1" when it falls on a later day than the way leaves. */
function Time({ t, start }: { t: string; start: string }) {
  const nd = nextDayMark(start, t)
  return (
    <span className="wt-tm">
      {clock(t)}
      {nd && <sup className="nd">{nd}</sup>}
      {timeUncertain(t) && <span className="warnmark" title="Time not known exactly">!</span>}
    </span>
  )
}

type Side = 'fly' | 'wait' | undefined

/** One airport point on the line: a ring, the line on either side of it, the code and times under it. */
function Node({ code, l, r, end, top, title, children }: {
  code: string
  l?: Side
  r?: Side
  end?: boolean
  top?: ReactNode
  title?: string
  children?: ReactNode
}) {
  return (
    <span className="wt-n" data-l={l} data-r={r} data-end={end ? '' : undefined} title={title}>
      <span className="wt-top">{top}</span>
      <span className="wt-dot"><i className="wt-ring" /></span>
      <b className="wt-c">{code}</b>
      {children}
    </span>
  )
}

/** What a wait says above the line: a moon and the nights, or how long the change is. */
function WaitLabel({ p }: { p: TrackWait }) {
  if (p.type === 'night') return <span className="wt-w night"><Moon />{nights(p.nights)}</span>
  if (p.type === 'day_stop') return <span className="wt-w day"><Sun s={12} />{hours(p.hours)}</span>
  if (p.type === 'self_transfer') return <span className="wt-w xfer"><Transfer s={12} />{hours(p.hours)}</span>
  if (p.overnight) return <span className="wt-w night"><Moon />{hours(p.hours)}</span>
  return <span className="wt-w">{hours(p.hours)}</span>
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
 * The way as a transit line, after the ReUI stepper on 21st.dev: a ring at every airport, the flights
 * as solid stretches in the way's colour, the waits dashed and dimmer, each node with its code and
 * local time under it. Evenly spaced, not to scale. A narrow card folds each wait into one node with
 * both times, and the line scrolls with fading edges if it still does not fit.
 */
export function WayTrack({ way, airports, compact = false }: { way: Way; airports?: Record<string, Airport>; compact?: boolean }) {
  const ref = useEdgeFade<HTMLDivElement>()
  const t = wayTrack(way)
  const start = way.depart
  const side = (i: number): Side => t.parts[i]?.kind
  const date = (s: string | null) => (s ? <small className="wt-dt">{day(s)}</small> : null)
  const items: ReactNode[] = [
    <Node key="s" code={t.start.code} r={side(0)} end title={t.start.time ? `${t.start.code}, leaves ${day(t.start.time)} ${clock(t.start.time)}` : t.start.code}>
      {t.start.time && <Time t={t.start.time} start={start} />}
      {date(t.start.time)}
    </Node>,
  ]
  t.parts.forEach((p, i) => {
    if (p.kind === 'fly') {
      items.push(
        <span key={i} className="wt-s" data-k="fly">
          <span className="wt-sl">{p.approx ? '~' : ''}{hours(p.hours)}</span>
        </span>,
      )
      return
    }
    const l: Side = side(i - 1) === 'fly' ? 'fly' : 'wait'
    const r: Side = side(i + 1) === 'fly' ? 'fly' : side(i + 1) ? 'wait' : undefined
    const title = waitTitle(p)
    const merged = (
      <Node code={p.code} l={l} r={r} top={<WaitLabel p={p} />} title={title}>
        {p.arrive && <Time t={p.arrive} start={start} />}
        {p.depart && <Time t={p.depart} start={start} />}
      </Node>
    )
    // a change inside one ticket has no times of its own, so it is always one node
    if (!p.arrive || !p.depart) {
      items.push(<Fragment key={i}>{merged}</Fragment>)
      return
    }
    items.push(
      <Fragment key={i}>
        <span className="wt-wide">
          <Node code={p.code} l={l} r="wait" title={title}><Time t={p.arrive} start={start} />{date(p.arrive)}</Node>
          <span className="wt-s" data-k="wait"><span className="wt-sl"><WaitLabel p={p} /></span></span>
          <Node code={p.code} l="wait" r={r} title={title}><Time t={p.depart} start={start} />{date(p.depart)}</Node>
        </span>
        <span className="wt-narrow">{merged}</span>
      </Fragment>,
    )
  })
  items.push(
    <Node key="e" code={t.end.code} l={side(t.parts.length - 1)} end title={t.end.time ? `${t.end.code}, lands ${day(t.end.time)} ${clock(t.end.time)}` : t.end.code}>
      {t.end.time && <Time t={t.end.time} start={start} />}
      {date(t.end.time)}
    </Node>,
  )
  return (
    <div className={`wt-box${compact ? ' compact' : ''}`} role="img" aria-label={wayTrackLabel(way, airports)}>
      <div ref={ref} className="wt">{items}</div>
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
