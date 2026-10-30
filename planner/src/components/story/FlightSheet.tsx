import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { CrawledFlight } from '../../data/types'
import { clock, dayDiff, hours, kr, nextDayMark, shortKr, weekdayDay } from '../../lib/format'
import { fareNotes, fareRows, sameFlight, seller, sortFares, stopsOf, timed, type FareRow, type FareSort } from '../../lib/fares'
import type { FlightLink } from '../../lib/links'
import { checkedAgo, momondoUrl, nearestDay, newestSeen, pricesOn, type PairDates } from '../../lib/prices'
import { flightPricesTask } from '../../lib/tasks'
import { Caret, Check, External, Plane } from '../icons'
import { stopsText } from './LegCard'

// The window behind a flight on the route: the days around it, each with its cheapest fare, and the
// flights of the day you are looking at. Each flight reads the way a ticket does, airline, then when it
// leaves and lands with the airports in between, then the price and Pick. Looking at a day changes
// nothing, only Pick does. A day with no fares shows the flights of the closest day that has some, so
// you still see how long the trip is and where it goes through.

/** the flights shown before Show all */
const SHOWN = 6
/** the days that fit the sheet without scrolling */
const FIT_DAYS = 8

export interface LegStay {
  fromName: string
  /** the day you get to where the leg leaves from */
  fromIn: string
  toName: string
  /** stops come after toName before that day, so the nights are for all of them */
  onward: boolean
  /** the day you have to be gone: the next leg with a fixed day, or the flight home */
  nextDay: string
  /** what leaves that day */
  nextLabel: string
}

const SORTS: [FareSort, string][] = [['cheap', 'Cheapest'], ['fast', 'Fastest'], ['early', 'Earliest']]

const nights = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

/** How long the day you are looking at leaves you on either side of the flight. */
function Stay({ at, stay }: { at: string; stay: LegStay }) {
  const before = dayDiff(stay.fromIn, at)
  const after = dayDiff(at, stay.nextDay)
  return (
    <dl className="fl-stay">
      <div>
        <dt>In {stay.fromName}</dt>
        <dd data-bad={before < 0}>{before < 0 ? 'Leaves before you get here' : before === 0 ? 'Passing through' : nights(before)}</dd>
      </div>
      <div>
        <dt>{stay.onward ? `From ${stay.toName} on` : `In ${stay.toName}`}</dt>
        <dd data-bad={after < 0}>
          {after < 0 ? `${stay.nextLabel} leaves first` : after === 0 ? 'Passing through' : nights(after)}
          <small>{stay.nextLabel} {weekdayDay(stay.nextDay)}</small>
        </dd>
      </div>
    </dl>
  )
}

function Days({ days, fares, at, leg, onChange }: { days: string[]; fares: Record<string, number>; at: string; leg: string; onChange: (d: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const prices = days.flatMap((d) => (fares[d] != null ? [fares[d]] : []))
  const low = prices.length > 1 ? Math.min(...prices) : null
  // the window opens in the parent's layout effect, so the strip has its width by now
  useEffect(() => {
    const b = box.current
    const el = b?.querySelector<HTMLElement>('[aria-checked="true"]')
    if (b && el) b.scrollTo({ left: el.offsetLeft - (b.clientWidth - el.offsetWidth) / 2 })
    // only on open, after that the strip stays where it was left
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const go = (d: string) => {
    onChange(d)
    box.current?.querySelector<HTMLElement>(`[data-d="${d}"]`)?.focus()
  }
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = days.indexOf(at)
    const to = e.key === 'ArrowRight' ? Math.min(i + 1, days.length - 1) : e.key === 'ArrowLeft' ? Math.max(i - 1, 0) : e.key === 'Home' ? 0 : e.key === 'End' ? days.length - 1 : -1
    if (to < 0) return
    e.preventDefault()
    go(days[to])
  }
  const page = (dir: number) => box.current?.scrollBy({ left: dir * box.current.clientWidth * 0.8, behavior: 'smooth' })
  const many = days.length > FIT_DAYS
  return (
    <div className="fl-strip">
      {many && <button type="button" className="fl-page" aria-label="Earlier days" onClick={() => page(-1)}><Caret dir="l" /></button>}
      <div ref={box} className="fl-days" role="radiogroup" aria-label="Day to look at" onKeyDown={onKey}>
        {days.map((d) => {
          const [wd, n, mon] = weekdayDay(d).split(' ')
          const p = fares[d]
          return (
            <button
              key={d} type="button" role="radio" className="fl-day" data-d={d} data-leg={d === leg} data-low={p === low}
              aria-checked={d === at} tabIndex={d === at ? 0 : -1}
              aria-label={`${wd} ${n} ${mon}, ${p != null ? `from ${kr(p)}` : 'no fare seen'}${d === leg ? ', the day of this leg' : ''}`}
              onClick={() => onChange(d)}
            >
              <small>{wd}</small>
              <b>{n} {mon}</b>
              <span>{p != null ? shortKr(p) : ''}</span>
            </button>
          )
        })}
      </div>
      {many && <button type="button" className="fl-page" aria-label="Later days" onClick={() => page(1)}><Caret dir="r" /></button>}
    </div>
  )
}

function Sort({ value, onChange }: { value: FareSort; onChange: (s: FareSort) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const keys = SORTS.map(([k]) => k)
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = keys.indexOf(value)
    const to =
      e.key === 'ArrowRight' || e.key === 'ArrowDown' ? (i + 1) % keys.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? (i - 1 + keys.length) % keys.length
          : e.key === 'Home' ? 0
            : e.key === 'End' ? keys.length - 1
              : -1
    if (to < 0) return
    e.preventDefault()
    onChange(keys[to])
    refs.current[to]?.focus()
  }
  return (
    <div className="seg fl-sort" role="radiogroup" aria-label="Sort flights by" onKeyDown={onKey}>
      {SORTS.map(([k, label], i) => (
        <button key={k} ref={(el) => { refs.current[i] = el }} type="button" role="radio" aria-checked={value === k} tabIndex={value === k ? 0 : -1} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  )
}

/** The airports in between with the wait at each. The count alone when the row does not know where. */
function Stops({ f, name }: { f: CrawledFlight; name: (code: string) => string }) {
  const n = stopsOf(f)
  if (!f.via.length) return <span>{stopsText(n)}</span>
  const more = n - f.via.length
  return (
    <>
      {f.via.map((code, i) => {
        const at = name(code)
        const wait = f.layover_h[i]
        return <span key={i}><b>{code}</b>{at !== code && ` ${at}`}{wait != null && ` ${hours(wait)}`}</span>
      })}
      {more > 0 && <span>and {more} more {more === 1 ? 'stop' : 'stops'}</span>}
    </>
  )
}

function Flight({ row, name, nextDay, now, onPick }: { row: FareRow; name: (code: string) => string; nextDay: string | null; now: number; onPick?: () => void }) {
  const { flight: f, others } = row
  const known = timed(f)
  const air = f.carriers.join(', ')
  const site = seller(f)
  const notes = fareNotes(f, name, nextDay)
  const dots = Array.from({ length: stopsOf(f) }, (_, i) => <i key={i} />)
  return (
    <div className="fl-row">
      <div className="fl-air">
        <span className="fl-logo" aria-hidden="true">{air ? air.slice(0, 2).toUpperCase() : <Plane s={16} />}</span>
        <div className="fl-who">
          <b title={air || undefined}>{air || 'Airline not listed'}</b>
          <small title={others.join(', ') || undefined}>{site}{others.length > 0 && `, ${others.length} more ${others.length === 1 ? 'site' : 'sites'}`}</small>
        </div>
      </div>
      {known ? (
        <div className="fl-line">
          <div className="fl-end">
            <b>{clock(f.depart)}</b>
            <small>{weekdayDay(f.depart)}</small>
          </div>
          <div className="fl-mid">
            <span className="fl-dur">{hours(f.hours)}</span>
            <div className="fl-track" aria-hidden="true">{dots}</div>
            <div className="fl-stops"><Stops f={f} name={name} /></div>
          </div>
          <div className="fl-end to">
            <b>{clock(f.arrive)}<sup>{nextDayMark(f.depart, f.arrive)}</sup></b>
            <small data-other={f.arrive.slice(0, 10) !== f.depart.slice(0, 10)}>{weekdayDay(f.arrive)}</small>
          </div>
        </div>
      ) : <p className="fl-notime">Times not known</p>}
      <div className="fl-price">
        <b title={f.observed_at ? checkedAgo(f.observed_at, now) : undefined}>{kr(f.price_dkk)}</b>
        {onPick && known && (
          <button type="button" className="btn small" aria-label={`Pick ${air || 'this flight'}, ${clock(f.depart)} to ${clock(f.arrive)}, ${kr(f.price_dkk)}`} onClick={onPick}>Pick</button>
        )}
      </div>
      {notes.length > 0 && <ul className="fl-notes">{notes.map((x) => <li key={x.text} data-bad={!!x.bad}>{x.text}</li>)}</ul>}
    </div>
  )
}

/** The flights of one day. Its own part, so Show all starts over with each day. */
function DayList({ rows, name, nextDay, now, onPick }: { rows: FareRow[]; name: (code: string) => string; nextDay: string | null; now: number; onPick?: (f: CrawledFlight) => void }) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <>
      <ol className="fl-rows">
        {shown.map((r) => <li key={r.flight.quote_id}><Flight row={r} name={name} nextDay={nextDay} now={now} onPick={onPick ? () => onPick(r.flight) : undefined} /></li>)}
      </ol>
      {rows.length > SHOWN && <button type="button" className="btn small fl-all" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
    </>
  )
}

export function FlightSheet({ from, to, typical, picked, date, days, fares, stay, pd, link, tripId, airportName, onPick, close }: {
  from: { code: string; name: string }
  to: { code: string; name: string }
  /** the usual price of the route, or null */
  typical: number | null
  picked: CrawledFlight | null
  /** the day of the leg */
  date: string
  days: string[]
  /** the cheapest fare known for each day */
  fares: Record<string, number>
  stay: LegStay
  pd: PairDates | null
  link: FlightLink | null
  tripId: string
  airportName: (code: string) => string
  onPick: (f: CrawledFlight | null) => void
  close: () => void
}) {
  const [at, setAt] = useState(date)
  const [by, setBy] = useState<FareSort>('cheap')
  const quotes = useMemo(() => (pd ? pricesOn(pd, from.code, to.code, at) : []), [pd, from.code, to.code, at])
  const rows = useMemo(() => fareRows(quotes, from.code, to.code, at), [quotes, from.code, to.code, at])
  const list = sortFares(picked ? rows.filter((r) => !sameFlight(r.flight, picked)) : rows, by)
  const near = useMemo(() => {
    const d = rows.length ? null : nearestDay(pd, from.code, to.code, at)
    if (!d || !pd) return null
    const found = fareRows(pricesOn(pd, from.code, to.code, d), from.code, to.code, d)
    return { day: d, away: dayDiff(at, d), rows: sortFares(picked ? found.filter((r) => !sameFlight(r.flight, picked)) : found, 'cheap') }
  }, [rows.length, pd, from.code, to.code, at, picked])
  const now = Date.now()
  const seen = newestSeen(quotes)
  const open = link?.saved && at === date ? { href: link.href, label: `Open on ${link.site}` } : { href: momondoUrl(from.code, to.code, at, tripId), label: 'Search Momondo' }
  const task = flightPricesTask({ from: from.code, to: to.code, date: at, fromName: from.name, toName: to.name })
  const pick = (f: CrawledFlight) => {
    onPick(f)
    close()
  }
  return (
    <div className="fl">
      <div className="fl-top">
        <header className="fl-h">
          <h3>{from.name} to {to.name}</h3>
          <small>{from.code} to {to.code}{!picked && typical != null && `, typical price ${kr(typical)}`}</small>
        </header>
        <Stay at={at} stay={stay} />
        <Days days={days} fares={fares} at={at} leg={date} onChange={setAt} />
        <div className="fl-bar">
          <b>{weekdayDay(at)}</b>
          {rows.length > 0 && <span>{rows.length === 1 ? '1 flight' : `${rows.length} flights`}{seen != null && `, ${checkedAgo(new Date(seen).toISOString(), now)}`}</span>}
          {rows.length > 1 && <Sort value={by} onChange={setBy} />}
        </div>
      </div>
      <div className="fl-list">
        {picked && (
          <section className="fl-picked" aria-label="The flight you picked">
            <header>
              <span><Check /> Picked</span>
              {picked.observed_at && <small>{checkedAgo(picked.observed_at, now)}</small>}
              <button type="button" className="btn link small" onClick={() => onPick(null)}>Remove</button>
            </header>
            <Flight row={{ flight: picked, others: [] }} name={airportName} nextDay={stay.nextDay} now={now} />
          </section>
        )}
        {rows.length === 0 ? (
          <>
            <div className="fl-none">
              <p>No fares seen for {weekdayDay(at)}</p>
              <a className="btn small primary" href={momondoUrl(from.code, to.code, at, tripId)} target="_blank" rel="noopener noreferrer">Search Momondo<External /></a>
            </div>
            {near && near.rows.length > 0 && (
              <section className="fl-near" aria-label="Nearest flights">
                <h4>Nearest flights, {weekdayDay(near.day)}<span>{Math.abs(near.away)} {Math.abs(near.away) === 1 ? 'day' : 'days'} {near.away > 0 ? 'later' : 'earlier'}</span></h4>
                <DayList key={near.day} rows={near.rows} name={airportName} nextDay={stay.nextDay} now={now} onPick={days.includes(near.day) ? pick : undefined} />
              </section>
            )}
          </>
        ) : <DayList key={at} rows={list} name={airportName} nextDay={stay.nextDay} now={now} onPick={pick} />}
      </div>
      <footer className="fl-foot">
        {rows.length > 0 && <a className="btn small" href={open.href} target="_blank" rel="noopener noreferrer">{open.label}<External /></a>}
        <a className="btn small link" href={task.url} target="_blank" rel="noopener noreferrer" title="A prefilled task. Claude checks every flight this day and 3 days either side">Ask Claude to check</a>
      </footer>
    </div>
  )
}
