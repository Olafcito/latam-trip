import { Fragment, lazy, Suspense } from 'react'
import { clock, hours, kr, legHours, nextDayMark, observed, weekdayDay } from '../../lib/format'
import { stopsOf } from '../../lib/fares'
import type { Hop, LegTime } from '../../lib/journey'
import { sourceLabel } from '../../lib/prices'
import type { FlightLink } from '../../lib/links'
import { External, ModeChip, Moon } from '../icons'
import type { Family } from '@map/data/types'
import type { LegPoint } from './LegMap'

// The card behind a leg on the timeline: a ticket stub for a bus or a boat, and for a flight with no
// airport codes to search. Times sit big at the ends when known, the line between them carries the
// stops, then the operator and the price. A bus or a boat also has a little map of its way, with the
// time it takes, or says that time is not known. A flight with its codes opens the FlightSheet instead.

// the outlines of the countries are a big file, so they come the first time a little map opens
const LegMap = lazy(() => import('./LegMap'))

export interface LegEnds { from: string; to: string; fromName: string; toName: string; fromCode: string | null; toCode: string | null }

export const stopsText = (n: number) => (n === 0 ? 'Direct' : n === 1 ? '1 stop' : `${n} stops`)

const inWords = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

function Track({ codes, waits, family }: { codes: string[]; waits: (number | null)[]; family: Family }) {
  return (
    <div className="lc-track" data-f={family} aria-hidden="true">
      {codes.map((c, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="lc-seg" />}
          <span className={`lc-dot${i === 0 || i === codes.length - 1 ? ' end' : ''}`}>
            {i > 0 && i < codes.length - 1 && (
              <span className="lc-via"><b>{c}</b>{waits[i - 1] != null && <small>{hours(waits[i - 1])}</small>}</span>
            )}
          </span>
        </Fragment>
      ))}
    </div>
  )
}

export function LegCard({ h, ends, family, date, time, points, link }: {
  h: Hop
  ends: LegEnds
  family: Family
  /** the day the leg leaves */
  date: string
  time: LegTime
  /** the way on the map, with the places it goes through, or null for no map */
  points: LegPoint[] | null
  link: FlightLink | null
}) {
  const f = h.flight
  const codes = [ends.fromCode ?? ends.fromName, ...(f?.via ?? []), ends.toCode ?? ends.toName]
  const dur = legHours(time) ?? (family === 'flight' ? null : 'Time not known')
  const through = time.about ? points?.slice(1, -1).map((p) => p.name) ?? [] : []
  const facts = [
    // the overland note already names who runs it
    f?.carriers.join(', ') || (h.overland ? null : h.operator),
    f ? stopsText(stopsOf(f)) : null,
    f?.cabin_bag ? `Cabin bag ${f.cabin_bag}` : null,
    f?.checked_bag ? `Checked bag ${f.checked_bag}` : null,
    h.border ? 'Crosses a border' : null,
  ].filter((x): x is string => !!x)
  const seen = f?.observed_at ?? h.observed_at
  return (
    <div className="lc" data-f={family}>
      <header className="lc-head">
        <ModeChip family={family} />
        <b className="lc-when">Leaves {weekdayDay(date)}</b>
        {h.overnight && <span className="lc-night"><Moon /> Overnight</span>}
      </header>

      <div className="lc-ends">
        <div className="lc-end">
          {f && <b className="lc-time">{clock(f.depart)}</b>}
          {f && <span className="lc-day">{weekdayDay(f.depart)}</span>}
          {ends.fromCode && <span className="lc-code">{ends.fromCode}</span>}
          <small>{ends.fromName}</small>
        </div>
        <div className="lc-mid">
          {dur && <span className="lc-dur">{dur}</span>}
          <Track codes={codes} waits={f?.layover_h ?? []} family={family} />
        </div>
        <div className="lc-end to">
          {f && <b className="lc-time">{clock(f.arrive)}<sup>{nextDayMark(f.depart, f.arrive)}</sup></b>}
          {f && <span className="lc-day">{weekdayDay(f.arrive)}</span>}
          {ends.toCode && <span className="lc-code">{ends.toCode}</span>}
          <small>{ends.toName}</small>
        </div>
      </div>

      {points && <Suspense fallback={<div className="lm" aria-hidden="true" />}><LegMap points={points} family={family} /></Suspense>}
      {h.overland && <p className="lc-note">{h.overland}</p>}
      {through.length > 0 && <p className="lc-note">Through {inWords(through)}. The time adds up those legs, with no waiting.</p>}
      {facts.length > 0 && <ul className="lc-facts">{facts.map((x) => <li key={x}>{x}</li>)}</ul>}

      <div className="lc-price">
        {h.price_dkk != null && <b>{kr(h.price_dkk)}</b>}
        <small>{f ? `${f.source ? sourceLabel(f.source) : 'Picked fare'}${seen ? `, seen ${observed(seen)}` : ''}` : h.price_dkk != null ? 'Typical price for this route' : 'No price yet'}</small>
      </div>

      {link && (
        <footer className="lc-act">
          <a className="btn small" href={link.href} target="_blank" rel="noopener noreferrer">{link.saved ? `Open on ${link.site}` : 'Search Momondo'}<External /></a>
        </footer>
      )}
    </div>
  )
}
