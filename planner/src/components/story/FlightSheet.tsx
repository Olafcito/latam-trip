import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { Booking, CrawledFlight } from '../../data/types'
import type { Family } from '@map/data/types'
import { Unknown } from '@map/map/Unknown'
import { bookedDay, bookedGate, isBookedFlight, parkedRow, priceColumn } from '../../lib/booked'
import { clock, dayDiff, hours, kr, nextDayMark, shortKr, weekdayDay } from '../../lib/format'
import { fareMarks, fareRows, sameFlight, seller, sortFares, stopsOf, timed, type FareRow, type FareSort } from '../../lib/fares'
import type { FlightLink } from '../../lib/links'
import { checkedAgo, momondoUrl, nearestDay, newestSeen, pricesOn, type PairDates } from '../../lib/prices'
import { remoteEnabled } from '../../lib/supabase'
import { flightPricesTask } from '../../lib/tasks'
import { AskClaude } from '../AskClaude'
import { dayValue, type DayItem, type DayKind, type DayValue } from '../../lib/tripDay'
import { Arrow, Bed, Boat, Bus, Caret, Check, Clock, Door, External, Home, Land, Plane, Sun } from '../icons'
import { BookedBox, type BoxData } from './BookedBox'
import { useBookingForm, type BookTarget } from './BookingForm'
import { stopsText } from './LegCard'
import { MarkIcon, Marks, Tip } from './Marks'
import type { Mark } from '../../lib/marks'

// The window behind a flight on the route: the days around it, each with its cheapest fare, and the
// flights of the day you are looking at. Each flight reads the way a ticket does, airline, then when it
// leaves and lands with the airports in between, then the price and Pick. Looking at a day changes
// nothing, only Pick does. A day with no fares shows the flights of the closest day that has some, so
// you still see how long the trip is and where it goes through. The flight you picked sits on top with
// its state under its price, where Pick sits on the others. One set aside when the leg moved to another
// day stays on top too, with the button that puts the leg back on its day. A booked leg opens on its
// booking: the box sits on top, the booked day shows what was paid, the other days show no fare, only
// marks of what else happens then, and the flights are folded away until Change booking opens them to
// look at. A press on any day shows the whole trip on that day under the strip, for a booked leg too.

/** the flights shown before Show all */
const SHOWN = 6
/** the days that fit the sheet without scrolling */
const FIT_DAYS = 8

export interface LegStay {
  fromName: string
  /** the place left is home, so it shows a home mark and no nights */
  fromHome?: boolean
  /** the day you get to where the leg leaves from */
  fromIn: string
  toName: string
  /** the place reached is home, so it shows a home mark and no nights, and nothing leaves after */
  toHome?: boolean
  /** stops come after toName before that day, so the nights are for all of them */
  onward: boolean
  /** the day you have to be gone: the next leg with a fixed day, or the flight home */
  nextDay: string
  /** what leaves that day */
  nextLabel: string
  /** how it leaves, for its icon */
  nextFamily: Family
}

const MODE_ICON: Record<Family, () => ReactElement> = { flight: () => <Plane s={13} />, boat: () => <Boat s={13} />, ground: () => <Bus s={13} /> }

const SORTS: [FareSort, string][] = [['cheap', 'Cheapest'], ['fast', 'Fastest'], ['early', 'Earliest']]

const nights = (n: number) => (n === 1 ? '1 night' : `${n} nights`)

/** Home as a side of the stay row: its name and a home mark, never a count of nights. */
function HomeSide({ name }: { name: string }) {
  return (
    <div>
      <dt>{name}</dt>
      <dd data-home><Tip className="mk" label={`${name}, home`}><Home s={15} /></Tip></dd>
    </div>
  )
}

/** How long the day you are looking at leaves you on either side of the flight. A flight that lands on a later day counts the place reached from that day. */
export function Stay({ at, lands = at, stay }: { at: string; lands?: string; stay: LegStay }) {
  const before = dayDiff(stay.fromIn, at)
  const after = dayDiff(lands, stay.nextDay)
  return (
    <dl className="fl-stay">
      {stay.fromHome ? <HomeSide name={stay.fromName} /> : (
        <div>
          <dt>In {stay.fromName}</dt>
          <dd data-bad={before < 0}>{before < 0 ? 'Leaves before you get here' : before === 0 ? 'Passing through' : nights(before)}</dd>
        </div>
      )}
      {stay.toHome ? <HomeSide name={stay.toName} /> : (
        <div>
          <dt>{stay.onward ? `From ${stay.toName} on` : `In ${stay.toName}`}</dt>
          <dd data-bad={after < 0}>
            {after < 0 ? `${stay.nextLabel} leaves first` : after === 0 ? 'Passing through' : nights(after)}
            <Tip className="mk" kind="next" label={`${stay.nextLabel}, ${weekdayDay(stay.nextDay)}`}>{MODE_ICON[stay.nextFamily]()}<span aria-hidden="true">{weekdayDay(stay.nextDay)}</span></Tip>
          </dd>
        </div>
      )}
    </dl>
  )
}

/** The trip on any day, and which leg is this sheet's own, so the strip marks the days and the day view lists them. */
export interface TripDays {
  items: (day: string) => DayItem[]
  /** the key of the sheet's own leg in the items */
  leg: string
}

const KIND_ICON: Record<DayKind, (p: { s?: number }) => ReactElement> = {
  flight: Plane, boat: Boat, ground: Bus, out: Door, in: Door, night: Bed, other: Sun,
}

/** What a day says under its date: the fare from, or a check on the booked day. */
function DayNote({ v }: { v: DayValue }) {
  // short, so a four or five figure amount fits a 60px day
  if (v.kind === 'fare') return <span className="fl-day-v">{shortKr(v.price)}</span>
  if (v.kind === 'booked') return <span className="fl-day-v" data-paid><Check s={13} /></span>
  return <span className="fl-day-v" />
}

const said = (v: DayValue) => (v.kind === 'fare' ? `from ${kr(v.price)}` : v.kind === 'booked' ? 'booked' : 'no fare seen')

export function Days({ days, fares, at, leg, onChange, booked }: {
  days: string[]; fares: Record<string, number>; at: string; leg: string; onChange: (d: string) => void
  /** the day of the booking, marked by a check and a thin green ring */
  booked?: string | null
}) {
  const box = useRef<HTMLDivElement>(null)
  // the cheapest is read among the days of the strip only
  const own = useMemo(() => Object.fromEntries(days.flatMap((d) => (fares[d] != null ? [[d, fares[d]]] : []))), [days, fares])
  const value = (d: string) => dayValue(d, { fares: own, booked: booked ?? null })
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
          const v = value(d)
          return (
            <button
              key={d} type="button" role="radio" className="fl-day" data-d={d} data-leg={d === leg}
              data-low={v.kind === 'fare' && v.low}
              data-booked={d === booked || undefined}
              aria-checked={d === at} tabIndex={d === at ? 0 : -1}
              aria-label={`${wd} ${n} ${mon}, ${said(v)}${d !== booked && d === leg ? ', the day of this leg' : ''}`}
              onClick={() => onChange(d)}
            >
              <small>{wd}</small>
              <b>{n} {mon}</b>
              <DayNote v={v} />
            </button>
          )
        })}
      </div>
      {many && <button type="button" className="fl-page" aria-label="Later days" onClick={() => page(1)}><Caret dir="r" /></button>}
    </div>
  )
}

/** The trip on the day you look at: what leaves and lands, check out and check in, booked activities and the night. */
export function DayView({ day, trip }: { day: string; trip: TripDays }) {
  const items = trip.items(day)
  return (
    <section className="dv" aria-label={`${weekdayDay(day)} on the trip`}>
      {items.length === 0 ? <p className="dv-none">Nothing planned</p> : (
        <ol>
          {items.map((it) => {
            const I = it.tag === 'Lands' ? Land : KIND_ICON[it.kind]
            return (
              <li key={it.key} data-kind={it.kind} data-own={(it.leg && it.leg === trip.leg) || undefined}>
                <span className="dv-i" aria-hidden="true"><I s={15} /></span>
                <span className="dv-when">
                  {it.time}
                  {it.until && <><Arrow s={10} />{it.until}{it.mark && <sup aria-hidden="true">{it.mark}</sup>}</>}
                </span>
                <span className="dv-what">
                  <b>{it.title}</b>
                  {it.detail && <small>{it.detail}</small>}
                </span>
                {it.tag && <span className="dv-tag">{it.tag}</span>}
                {it.booked ? <span className="dv-ok" title="Booked"><Check s={13} /><span className="vh">, booked</span></span> : <span className="dv-ok" />}
              </li>
            )
          })}
        </ol>
      )}
    </section>
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

/** The airports in between with the wait at each, a long wait or a night marked on its stop. The count alone when the row does not know where. */
function Stops({ f, name, marks }: { f: CrawledFlight; name: (code: string) => string; marks: (Mark | null)[] }) {
  const n = stopsOf(f)
  if (!f.via.length) return <span>{stopsText(n)}</span>
  const more = n - f.via.length
  return (
    <>
      {f.via.map((code, i) => {
        const at = name(code)
        const wait = f.layover_h[i]
        const m = marks[i]
        return <span key={i} data-tone={m?.tone}>{m && <MarkIcon m={m} bare />}<b>{code}</b>{at !== code && ` ${at}`}{wait != null && ` ${hours(wait)}`}</span>
      })}
      {more > 0 && <span>and {more} more {more === 1 ? 'stop' : 'stops'}</span>}
    </>
  )
}

/** What a row shows under its price besides Pick: the state of the flight you picked, or the button that brings a parked one back. */
interface RowState {
  picked?: boolean
  /** this flight is the one the booking is for */
  booked?: boolean
  /** the leg is booked, so the picked flight is not removed here */
  locked?: boolean
  onRemove?: () => void
  onOpenBooking?: () => void
  /** a parked flight: the leg goes back to its day */
  onUseDay?: () => void
}

/** The Picked or Booked mark under a price, in both sheets. A booked one opens its booking when the sheet can. */
export function Chip({ text, onOpen }: { text: 'Picked' | 'Booked'; onOpen?: () => void }) {
  const booked = text === 'Booked' || undefined
  if (booked && onOpen) return <button type="button" className="fl-chip" data-booked onClick={onOpen} aria-label="Booked, open the booking"><Check /> Booked</button>
  return <span className="fl-chip" data-booked={booked}><Check /> {text}</span>
}

function Flight({ row, name, nextDay, now, onPick, state = {} }: { row: FareRow; name: (code: string) => string; nextDay: string | null; now: number; onPick?: () => void; state?: RowState }) {
  const { flight: f, others } = row
  const known = timed(f)
  const col = priceColumn({ picked: !!state.picked, booked: !!state.booked, locked: !!state.locked, canPick: !!onPick && known, canRemove: !!state.onRemove })
  const air = f.carriers.join(', ')
  const site = seller(f)
  const { stops, leaves, lands, badges } = fareMarks(f, name, nextDay)
  const dots = Array.from({ length: stopsOf(f) }, (_, i) => <i key={i} />)
  return (
    <div className="fl-row">
      <div className="fl-air">
        <span className="fl-logo" aria-hidden="true">{air ? air.slice(0, 2).toUpperCase() : <Plane s={16} />}</span>
        <div className="fl-who">
          <b title={air || undefined}>{air || 'Airline not listed'}</b>
          <small className="fl-site">
            <span title={site}>{site}</span>
            {others.length > 0 && <Tip className="fl-more" label={`Also on ${others.join(', ')}`}><span aria-hidden="true">+{others.length}</span></Tip>}
          </small>
        </div>
      </div>
      {known ? (
        <div className="fl-line">
          <div className="fl-end">
            <b>{clock(f.depart)}</b>
            <small>{weekdayDay(f.depart)}{leaves && <MarkIcon m={leaves} bare />}</small>
          </div>
          <div className="fl-mid">
            <span className="fl-dur">{hours(f.hours)}</span>
            <div className="fl-track" aria-hidden="true">{dots}</div>
            <div className="fl-stops"><Stops f={f} name={name} marks={stops} /></div>
          </div>
          <div className="fl-end to">
            <b>{clock(f.arrive)}<sup>{nextDayMark(f.depart, f.arrive)}</sup></b>
            <small data-other={f.arrive.slice(0, 10) !== f.depart.slice(0, 10)} data-tone={lands?.tone}>{lands && <MarkIcon m={lands} bare />}{weekdayDay(f.arrive)}</small>
          </div>
        </div>
      ) : <p className="fl-notime"><Unknown title="Flight times not known" /></p>}
      <div className="fl-price">
        <b title={f.observed_at ? checkedAgo(f.observed_at, now) : undefined}>{kr(f.price_dkk)}</b>
        {col.chip && <Chip text={col.chip} onOpen={state.onOpenBooking} />}
        {col.pick && (
          <button type="button" className="btn small" aria-label={`Pick ${air || 'this flight'}, ${clock(f.depart)} to ${clock(f.arrive)}, ${kr(f.price_dkk)}`} onClick={onPick}>Pick</button>
        )}
        {col.remove && <button type="button" className="btn link small fl-remove" aria-label={`Remove the picked flight, ${air || 'this flight'} ${clock(f.depart)}`} onClick={state.onRemove}>Remove</button>}
        {state.onUseDay && <button type="button" className="btn small primary" aria-label={`Use this day, ${weekdayDay(f.depart)}, the flight comes back`} onClick={state.onUseDay}>Use this day</button>}
      </div>
      <Marks list={badges} />
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

export function FlightSheet({ from, to, typical, picked, parked, booking, data, unlocked, onUnlock, date, days, fares, stay, pd, link, tripId, tripVersion, airportName, onPick, book, onUseDay, trip, close }: {
  from: { code: string; name: string }
  to: { code: string; name: string }
  /** the usual price of the route, or null */
  typical: number | null
  picked: CrawledFlight | null
  /** the flight picked for another day, set aside when the leg moved off it */
  parked?: CrawledFlight | null
  /** the booking of this leg on its day */
  booking?: Booking | null
  /** the airports and the places, for the cities in the booked box */
  data: BoxData
  /** Change booking is on: the days and the flights under the box are open */
  unlocked?: boolean
  onUnlock?: (on: boolean) => void
  /** the day of the leg */
  date: string
  days: string[]
  /** the cheapest fare known for each day */
  fares: Record<string, number>
  stay: LegStay
  pd: PairDates | null
  link: FlightLink | null
  tripId: string
  /** the version of the trip the sheet was opened from */
  tripVersion?: number
  airportName: (code: string) => string
  onPick: (f: CrawledFlight | null) => void
  /** what the booking form saves to. Without it the leg is not marked here, and a booked leg's flights are there to look at only */
  book?: BookTarget<CrawledFlight>
  /** puts the leg on a day. A booked leg keeps its day, so the sheet never calls it there */
  onUseDay?: (day: string) => void
  /** the whole trip on any day, for the day view under the strip and the marks of a booked leg */
  trip?: TripDays
  close: () => void
}) {
  const [at, setAt] = useState(date)
  const [by, setBy] = useState<FareSort>('cheap')
  const quotes = useMemo(() => (pd ? pricesOn(pd, from.code, to.code, at) : []), [pd, from.code, to.code, at])
  const rows = useMemo(() => fareRows(quotes, from.code, to.code, at), [quotes, from.code, to.code, at])
  const away = parkedRow(parked, date)
  // the flight on top, picked or parked, is not listed again under it
  const top = picked ?? (away ? parked! : null)
  const list = sortFares(top ? rows.filter((r) => !sameFlight(r.flight, top)) : rows, by)
  const near = useMemo(() => {
    const d = rows.length ? null : nearestDay(pd, from.code, to.code, at)
    if (!d || !pd) return null
    const found = fareRows(pricesOn(pd, from.code, to.code, d), from.code, to.code, d)
    return { day: d, away: dayDiff(at, d), rows: sortFares(top ? found.filter((r) => !sameFlight(r.flight, top)) : found, 'cheap') }
  }, [rows.length, pd, from.code, to.code, at, top])
  // the pressed Use this day goes as the flight comes back, so the focus goes to the flight
  const held = useRef<HTMLElement>(null)
  const [used, setUsed] = useState(false)
  const parkedH = useId()
  useEffect(() => { if (used && picked) held.current?.focus({ preventScroll: true }) }, [used, picked])
  const now = Date.now()
  const seen = newestSeen(quotes)
  const open = link?.saved && at === date ? { href: link.href, label: `Open on ${link.site}` } : { href: momondoUrl(from.code, to.code, at, tripId), label: 'Search Momondo' }
  const task = flightPricesTask({ from: from.code, to: to.code, date: at, fromName: from.name, toName: to.name })
  const pick = (f: CrawledFlight) => {
    onPick(f)
    close()
  }
  const box = useRef<HTMLElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  // back from the form, the focus goes to the booking it saved, or to Mark as booked when it was left
  const form = useBookingForm(book, () => (box.current ? showBox() : pill.current?.focus({ preventScroll: true })))
  // a booked leg is held: the box shows the booking and nothing under it changes the leg. Opened with Change
  // booking, a flight picked there opens the form on the booking, so the save changes that row
  const { hold, choose } = bookedGate<CrawledFlight>({
    booking, unlocked, pick,
    onRebook: book && booking ? (f) => form.open({ start: 'picked', picked: f, pin: f, booking, ids: () => [booking.id] }) : undefined,
  })
  const showBox = () => {
    const b = box.current
    if (!b) return
    b.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    b.focus({ preventScroll: true })
  }
  const change = (on: boolean) => {
    onUnlock?.(on)
    if (!on) setAt(date)
  }
  // once the booking is removed the box goes, so the line under the header says so and takes the focus
  const [removed, setRemoved] = useState(false)
  const said = useRef<HTMLParagraphElement>(null)
  useEffect(() => { if (removed && !booking) said.current?.focus({ preventScroll: true }) }, [removed, booking])
  if (form.node) return form.node
  return (
    <div className="fl" data-booked={booking ? true : undefined}>
      <div className="fl-top">
        <header className="fl-h">
          <h3>{from.name} to {to.name}</h3>
          <small className="ws-sub">
            <span className="ws-codes" role="img" aria-label={`${from.code} to ${to.code}`}><b>{from.code}</b><Arrow s={12} /><b>{to.code}</b></span>
            {!picked && !booking && typical != null && <Tip className="mk" label={`Typical ${kr(typical)}, what the route usually costs`}><span aria-hidden="true">Typical {kr(typical)}</span></Tip>}
          </small>
        </header>
        {booking && <BookedBox ref={box} booking={booking} data={data} changing={!!unlocked} onChange={change} onRemoved={() => setRemoved(true)}
          onEdit={book ? () => form.open({ start: 'manual', edit: true, booking }) : undefined} />}
        <p ref={said} className="ws-said" role="status" tabIndex={-1}>{removed && !booking ? 'The booking is removed. The leg can change again.' : ''}</p>
        <Stay at={hold ? date : at} stay={stay} />
        {!hold && <Days days={days} fares={fares} at={at} leg={date} onChange={setAt} booked={bookedDay(booking, date)} />}
        {!hold && <div className="fl-bar">
          <b>{weekdayDay(at)}</b>
          {rows.length > 0 && seen != null && (() => {
            const at = new Date(seen).toISOString()
            return <Tip className="mk" label={`Prices ${checkedAgo(at, now)}`}><Clock /><span aria-hidden="true">{checkedAgo(at, now, 'short')}</span></Tip>
          })()}
          {rows.length > 1 && <Sort value={by} onChange={setBy} />}
        </div>}
      </div>
      {!hold && <div className="fl-list">
        {trip && <DayView day={at} trip={trip} />}
        {picked && (
          <section ref={held} className="fl-picked" aria-label={isBookedFlight(booking, picked) ? 'The flight you booked' : 'The flight you picked'} tabIndex={-1}>
            <Flight
              row={{ flight: picked, others: [] }} name={airportName} nextDay={stay.nextDay} now={now}
              state={{ picked: true, booked: isBookedFlight(booking, picked), locked: !!booking, onRemove: () => onPick(null), onOpenBooking: booking ? showBox : undefined }}
            />
          </section>
        )}
        {!picked && away && parked && (
          <section className="fl-picked fl-parked" aria-labelledby={parkedH}>
            <h4 id={parkedH}>{away.title}</h4>
            <Flight
              row={{ flight: parked, others: [] }} name={airportName} nextDay={stay.nextDay} now={now}
              state={{ onUseDay: !booking && onUseDay ? () => { onUseDay(away.day); setAt(away.day); setUsed(true) } : undefined }}
            />
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
                <DayList key={near.day} rows={near.rows} name={airportName} nextDay={stay.nextDay} now={now} onPick={days.includes(near.day) ? choose : undefined} />
              </section>
            )}
          </>
        ) : <DayList key={at} rows={list} name={airportName} nextDay={stay.nextDay} now={now} onPick={choose} />}
      </div>}
      {!hold && (
        <footer className="fl-foot">
          {rows.length > 0 && <a className="btn small" href={open.href} target="_blank" rel="noopener noreferrer">{open.label}<External /></a>}
          <AskClaude draft={task} tripId={tripId} version={tripVersion ?? null} title="Claude checks every flight this day and 3 days either side" />
          {book && !booking && remoteEnabled() && (
            <button ref={pill} type="button" className="btn small mark-booked" onClick={() => form.open({ start: picked ? 'picked' : 'manual', picked, pin: picked ?? undefined })}>
              <Check s={14} />Mark as booked
            </button>
          )}
        </footer>
      )}
    </div>
  )
}
