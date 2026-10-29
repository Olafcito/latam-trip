import { Fragment } from 'react'
import { clock, hours, kr, nextDayMark, observed, weekdayDay } from '../../lib/format'
import type { Hop } from '../../lib/journey'
import { checkedAgo, momondoUrl, sourceLabel, type PairQuote } from '../../lib/prices'
import { flightPricesTask } from '../../lib/tasks'
import type { FlightLink } from '../../lib/links'
import { External, ModeChip, Moon } from '../icons'
import type { Family } from '@map/data/types'

// The card behind a leg on the timeline: a boarding pass for a flight, a ticket stub for a bus or a
// boat. Times sit big at the ends, the line between them carries the stops, then the airline,
// bags and price, the other fares known for the day, and where to look again.

export interface LegEnds { from: string; to: string; fromName: string; toName: string; fromCode: string | null; toCode: string | null }

const stopsText = (n: number) => (n === 0 ? 'Direct' : n === 1 ? '1 stop' : `${n} stops`)

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

export function LegCard({ h, ends, family, date, quotes, link }: {
  h: Hop
  ends: LegEnds
  family: Family
  /** the day the leg leaves */
  date: string
  /** the fares known for the leg on that day, cheapest first */
  quotes: PairQuote[]
  link: FlightLink | null
}) {
  const f = h.flight
  const now = Date.now()
  const codes = [ends.fromCode ?? ends.fromName, ...(f?.via ?? []), ends.toCode ?? ends.toName]
  const others = quotes.filter((q) => !(f && q.d === clock(f.depart) && q.a === clock(f.arrive))).slice(0, 3)
  const task = ends.fromCode && ends.toCode ? flightPricesTask({ from: ends.fromCode, to: ends.toCode, date, fromName: ends.fromName, toName: ends.toName }) : null
  const facts = [
    // the overland note already names who runs it
    f?.carriers.join(', ') || (h.overland ? null : h.operator),
    f ? stopsText(f.via.length) : null,
    f?.cabin_bag ? `Cabin bag ${f.cabin_bag}` : null,
    f?.checked_bag ? `Checked bag ${f.checked_bag}` : null,
    h.border ? 'Crosses a border' : null,
  ].filter((x): x is string => !!x)
  const seen = f?.observed_at ?? h.observed_at
  return (
    <div className="lc" data-f={family}>
      <header className="lc-head">
        <ModeChip family={family} />
        <span>{weekdayDay(date)}</span>
        {h.overnight && <span className="lc-night"><Moon /> Overnight</span>}
      </header>

      <div className="lc-ends">
        <div className="lc-end">
          {f && <b className="lc-time">{clock(f.depart)}</b>}
          <span className="lc-code">{ends.fromCode ?? ''}</span>
          <small>{ends.fromName}</small>
        </div>
        <div className="lc-mid">
          <span className="lc-dur">{(f?.hours ?? h.hours) != null ? hours(f?.hours ?? h.hours) : 'times ?'}</span>
          <Track codes={codes} waits={f?.layover_h ?? []} family={family} />
        </div>
        <div className="lc-end to">
          {f && <b className="lc-time">{clock(f.arrive)}<sup>{nextDayMark(f.depart, f.arrive)}</sup></b>}
          <span className="lc-code">{ends.toCode ?? ''}</span>
          <small>{ends.toName}</small>
        </div>
      </div>

      {h.overland && <p className="lc-note">{h.overland}</p>}
      {facts.length > 0 && <ul className="lc-facts">{facts.map((x) => <li key={x}>{x}</li>)}</ul>}

      <div className="lc-price">
        {h.price_dkk != null && <b>{kr(h.price_dkk)}</b>}
        <small>{f ? `${f.source ? sourceLabel(f.source) : 'Picked fare'}${seen ? `, seen ${observed(seen)}` : ''}` : h.price_dkk != null ? 'Typical price for this route' : 'No price yet'}</small>
      </div>

      {others.length > 0 && (
        <ul className="lc-others" aria-label="Other fares known for this day">
          {others.map((q, i) => (
            <li key={i}>
              <b>{kr(q.p)}</b>
              <span>{q.d && q.a ? `${q.d} to ${q.a}` : 'Times ?'}{q.n ? <sup>+{q.n}</sup> : null}</span>
              <span className="lc-o-c">{[q.c.join(', ') || null, stopsText(q.s)].filter(Boolean).join(' · ')}</span>
              <small>{checkedAgo(q.at, now)}</small>
            </li>
          ))}
        </ul>
      )}

      {(link || task || (ends.fromCode && ends.toCode)) && (
        <footer className="lc-act">
          {link && <a className="btn small" href={link.href} target="_blank" rel="noopener noreferrer">{link.saved ? `Open on ${link.site}` : 'Search Momondo'}<External /></a>}
          {!link && ends.fromCode && ends.toCode && family === 'flight' && (
            <a className="btn small" href={momondoUrl(ends.fromCode, ends.toCode, date)} target="_blank" rel="noopener noreferrer">Search Momondo<External /></a>
          )}
          {task && family === 'flight' && <a className="btn small link" href={task.url} target="_blank" rel="noopener noreferrer" title="A prefilled task. Claude checks a day either side">Ask Claude to check</a>}
        </footer>
      )}
    </div>
  )
}
