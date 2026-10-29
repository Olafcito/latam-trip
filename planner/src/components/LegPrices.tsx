import { useState } from 'react'
import type { MapData } from '../data/types'
import { usePairDates } from '../data/pairDates'
import { hours, kr, weekdayDay } from '../lib/format'
import { checkedAgo, iataOf, momondoUrl, priceState, pricesOn, sourceLabel, STALE_DAYS, type PairQuote } from '../lib/prices'
import type { RouteLeg } from '../lib/route'
import { flightPricesTask } from '../lib/tasks'

// The known prices for the fly-on leg picked in the trip hero, on its day, cheapest first. When
// none are known or the newest is older than STALE_DAYS, it offers a Momondo search and a task
// for Claude to look.

const SHOWN = 5

function stops(n: number): string {
  return n === 0 ? 'Direct' : n === 1 ? '1 stop' : `${n} stops`
}

function QuoteRow({ q, now }: { q: PairQuote; now: number }) {
  const times = q.d && q.a ? `${q.d} to ${q.a}` : null
  return (
    <li className="lp-q">
      <b className="lp-p">{kr(q.p)}</b>
      <span className="lp-t">
        {times ?? 'Times ?'}
        {q.n ? <sup className="lp-n" title={`Lands ${q.n === 1 ? 'the next day' : `${q.n} days later`}`}>+{q.n}</sup> : null}
        <span className="lp-h">{hours(q.h)}</span>
      </span>
      <span className="lp-c">{[q.c.join(', ') || null, stops(q.s)].filter(Boolean).join(' · ')}</span>
      <span className="lp-s">{sourceLabel(q.src)}, {checkedAgo(q.at, now)}</span>
    </li>
  )
}

export function LegPrices({ leg, map }: { leg: RouteLeg; map: MapData }) {
  const pd = usePairDates()
  const [all, setAll] = useState(false)
  const from = iataOf(map, leg.from)
  const to = iataOf(map, leg.to)
  const now = Date.now()
  const quotes = from && to ? pricesOn(pd, from, to, leg.date) : []
  const state = priceState(quotes, now)
  const shown = all ? quotes : quotes.slice(0, SHOWN)
  const task = from && to ? flightPricesTask({ from, to, date: leg.date, fromName: leg.fromName, toName: leg.toName }) : null

  return (
    <section className="lp" aria-label={`Prices from ${leg.fromName} to ${leg.toName}`} aria-live="polite">
      <p className="lp-head">
        <b>{leg.fromName} to {leg.toName}</b>
        <span>{weekdayDay(leg.date)}{leg.dated ? '' : ', a rough day'}</span>
      </p>
      {shown.length > 0 && (
        <ul className="lp-list">
          {shown.map((q, i) => <QuoteRow key={i} q={q} now={now} />)}
        </ul>
      )}
      {quotes.length > SHOWN && (
        <button type="button" className="btn link small lp-more" onClick={() => setAll((x) => !x)}>
          {all ? 'Show fewer' : `Show all ${quotes.length}`}
        </button>
      )}
      {state !== 'fresh' && (
        <div className="lp-act">
          <span className="lp-why">
            {pd == null && state === 'none' ? 'No prices loaded for this day.'
              : state === 'none' ? 'No prices saved for this day.'
              : `The newest price is more than ${STALE_DAYS} days old.`}
          </span>
          {from && to && task && (
            <span className="lp-btns">
              <a className="btn small" href={momondoUrl(from, to, leg.date)} target="_blank" rel="noopener noreferrer">Open on Momondo</a>
              <a className="btn small primary" href={task.url} target="_blank" rel="noopener noreferrer" title="Opens a prefilled checklist task. Submit it and Claude looks a day either side.">Ask Claude</a>
            </span>
          )}
        </div>
      )}
    </section>
  )
}
