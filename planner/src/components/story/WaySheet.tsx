import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppData, Booking, Way } from '../../data/types'
import { bookedDay, bookedGate, isBookedFlight, paidPrice, priceColumn } from '../../lib/booked'
import { wayRebookIds } from '../../lib/bookingDraft'
import { clock, hours, kr, nextDayMark, shortPlace, weekdayDay } from '../../lib/format'
import type { FlightLink } from '../../lib/links'
import { wayLinks } from '../../lib/links'
import { momondoUrl } from '../../lib/prices'
import { remoteEnabled } from '../../lib/supabase'
import { dayOf, type WayChoice } from '../../lib/ways'
import { kindOf, rowFares, wayMarks, type WayRow } from '../../lib/wayRows'
import { FlightLinks } from '../FlightLinks'
import { Arrow, Caret, Check, Plane, Warn } from '../icons'
import { BookedBox } from './BookedBox'
import { useBookingForm, type BookTarget } from './BookingForm'
import { Chip, Days, DayView, type TripDays } from './FlightSheet'
import { useStore } from '../../store'
import { MarkIcon, Marks, Tip } from './Marks'

// The way in or the way home opened like any other leg: the days it can leave with a price each, and
// the ways of the day you look at as tickets, airline, when it leaves and lands with the airports in
// between, and what both ways cost once it is picked, since a return ticket is one price for both.
// Looking at a day changes nothing, only Pick does. A pick that only changes this way closes the
// sheet. A pick that also moves or changes the other way keeps it open and says so, where you pressed,
// so the change to the other end of the trip is never a surprise. A pick the trip refuses, one that
// would change a booked way, keeps it open too and says why. A booked way opens on its booking, the
// booked day showing what was paid, the other days no fare, and the ways folded away until Change
// booking opens them to look at. A press on a day shows the whole trip on that day under the strip.

/** the ways shown before Show all */
const SHOWN = 6

function carriersOf(way: Way, data: AppData): string[] {
  const flown = [...new Set(way.timeline.flatMap((t) => (t.kind === 'flight' ? t.carriers : [])))]
  if (flown.length) return flown
  return [...new Set(way.tickets.flatMap((id) => data.inout.tickets[id]?.carriers ?? []))]
}

/**
 * The right column of a row: what both ways cost with it, and under that what you can do with it. Its
 * own part, so a booked way can show its state here the same way.
 */
function WayState({ total, picked, booked, dead, label, onPick, onDead, onOpenBooking }: {
  total: number | null; picked: boolean; booked: boolean
  /** why picking it changes nothing: its Pick stays, greyed, and says so when pressed */
  dead: string | null
  label: string; onPick?: () => void; onDead?: (why: string) => void; onOpenBooking?: () => void
}) {
  const col = priceColumn({ picked, booked, canPick: !dead && !!onPick, canRemove: false })
  const greyed = !picked && !!dead && !!onPick
  return (
    <div className="fl-price" data-dead={greyed || undefined}>
      {(col.chip || col.pick || (greyed && total != null)) && <b>{kr(total)}</b>}
      {col.chip && <Chip text={col.chip} onOpen={onOpenBooking} />}
      {col.pick && <button type="button" className="btn small" aria-label={`Pick ${label}${total != null ? `, ${kr(total)} for both ways` : ''}`} onClick={onPick}>Pick</button>}
      {greyed && <button type="button" className="btn small" aria-disabled="true" title={dead} aria-label={`Pick ${label}. ${dead}`} onClick={() => onDead?.(dead)}>Pick</button>}
    </div>
  )
}

function WayRowView({ r, picked, booking, dir, other, data, name, onPick, onDead, onOpenBooking }: {
  r: WayRow; picked: boolean; booking: Booking | null; dir: 'in' | 'home'; other: Way; data: AppData; name: (code: string) => string
  onPick?: () => void; onDead?: (why: string) => void; onOpenBooking?: () => void
}) {
  const w = r.way
  const air = carriersOf(w, data)
  const who = air.join(', ')
  const { stops, leaves, lands, badges, dead } = wayMarks(data.inout, r, dir, other, name)
  const label = `${who || 'this way'}, ${weekdayDay(w.depart)} ${clock(w.depart)} to ${clock(w.arrive)}`
  return (
    <div className="fl-row" data-picked={picked || undefined}>
      <div className="fl-air">
        <span className="fl-logo" aria-hidden="true">{who ? who.slice(0, 2).toUpperCase() : <Plane s={16} />}</span>
        <div className="fl-who">
          <b title={who || undefined}>{who || 'Airline not listed'}</b>
          <small>{kindOf(data.inout, r)}</small>
        </div>
      </div>
      <div className="fl-line">
        <div className="fl-end">
          <b>{clock(w.depart)}</b>
          <small>{weekdayDay(w.depart)}{leaves && <MarkIcon m={leaves} bare />}</small>
        </div>
        <div className="fl-mid">
          <span className="fl-dur">{hours(w.total_hours)}</span>
          <div className="fl-track" aria-hidden="true">{stops.map((_, i) => <i key={i} />)}</div>
          <div className="fl-stops">
            {stops.length === 0 ? <span>Direct</span> : stops.map((s, i) => {
              const at = name(s.code)
              return <span key={i} data-tone={s.mark?.tone}>{s.mark && <MarkIcon m={s.mark} bare />}<b>{s.code}</b>{at !== s.code && ` ${at}`}{s.text && ` ${s.text}`}</span>
            })}
          </div>
        </div>
        <div className="fl-end to">
          <b>{clock(w.arrive)}<sup>{nextDayMark(w.depart, w.arrive)}</sup></b>
          <small data-other={w.arrive.slice(0, 10) !== w.depart.slice(0, 10)}>{lands && <MarkIcon m={lands} bare />}{weekdayDay(w.arrive)}</small>
        </div>
      </div>
      <WayState total={r.total} picked={picked} booked={picked && isBookedFlight(booking, w)} dead={picked ? null : dead} label={label} onPick={onPick} onDead={onDead} onOpenBooking={onOpenBooking} />
      <Marks list={badges} />
    </div>
  )
}

/** The ways of one day. Its own part, so Show all starts over with each day. */
function DayList({ rows, current, booking, dir, other, data, name, onPick, onDead, onOpenBooking }: {
  rows: WayRow[]; current: string; booking: Booking | null; dir: 'in' | 'home'; other: Way; data: AppData; name: (code: string) => string
  onPick?: (r: WayRow) => void; onDead?: (why: string) => void; onOpenBooking?: () => void
}) {
  const [all, setAll] = useState(false)
  const shown = all ? rows : rows.slice(0, SHOWN)
  return (
    <>
      <ol className="fl-rows">
        {shown.map((r) => (
          <li key={r.way.id}>
            <WayRowView r={r} picked={r.way.id === current} booking={booking} dir={dir} other={other} data={data} name={name} onPick={onPick && (() => onPick(r))} onDead={onDead} onOpenBooking={onOpenBooking} />
          </li>
        ))}
      </ol>
      {rows.length > SHOWN && <button type="button" className="btn small fl-all" onClick={() => setAll((x) => !x)}>{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
    </>
  )
}

export function WaySheet({ dir, way, other, byDay, data, tripId, booking, pair, unlocked, onUnlock, onPick, book, onChangeEnds, trip, close }: {
  dir: 'in' | 'home'
  /** the way the trip has in this direction */
  way: Way
  /** the way the trip has in the other direction */
  other: Way
  /** the rows of each day for this way, as wayRowsByDay makes them */
  byDay: Record<string, WayRow[]>
  data: AppData
  /** the trip, so a flight picked on Momondo finds its way back */
  tripId?: string
  /** the booking of the way the trip has, on the day it leaves */
  booking?: Booking | null
  /** the bookings of both ways, so a way on one ticket with the other changes both rows */
  pair?: { in: Booking | null; home: Booking | null }
  /** Change booking is on: the days and the ways under the box are open */
  unlocked?: boolean
  onUnlock?: (on: boolean) => void
  /** true when the pick went on, or why it did not. One that would change a booked way does not, and the sheet stays open on the reason */
  onPick: (c: WayChoice) => true | string
  /** what the booking form saves to. Without it the way is not marked here, and a booked way's ways are there to look at only */
  book?: BookTarget<WayChoice>
  /** left out while an older version is open, and the button goes with it */
  onChangeEnds?: () => void
  /** the whole trip on any day, for the day view under the strip and the marks of a booked way */
  trip?: TripDays
  close: () => void
}) {
  const { inout, map } = data
  const bookings = useStore((st) => st.bookings)
  const days = useMemo(() => Object.keys(byDay).sort(), [byDay])
  const fares = useMemo(() => rowFares(byDay), [byDay])
  const [at, setAt] = useState(() => dayOf(way))
  const [said, setSaid] = useState<{ text: string; n: number; bad?: boolean } | null>(null)
  const status = useRef<HTMLParagraphElement>(null)
  // the order a day's ways had when it was first looked at, so a pick never moves a row from under the pointer
  const order = useRef<Record<string, string[]>>({})
  const name = (code: string) => shortPlace(inout.airports[code]?.name ?? map.nodes.find((n) => n.iata === code)?.name ?? code)

  const found = byDay[at] ?? []
  if (found.length && !order.current[at]) {
    const ids = found.map((r) => r.way.id)
    // the way the trip has comes first on its day, so the sheet opens on what you have
    order.current[at] = ids.includes(way.id) ? [way.id, ...ids.filter((id) => id !== way.id)] : ids
  }
  const seen = order.current[at] ?? []
  const place = (id: string) => { const i = seen.indexOf(id); return i < 0 ? seen.length : i }
  const rows = [...found].sort((a, b) => place(a.way.id) - place(b.way.id))

  // the pressed Pick turns into the Picked mark, so the focus goes to the line that says what changed
  useEffect(() => { if (said) status.current?.focus({ preventScroll: true }) }, [said])

  const say = (text: string, bad?: boolean) => setSaid({ text, n: (said?.n ?? 0) + 1, bad })
  const pick = (r: WayRow) => {
    const went = onPick(r.choice)
    if (went !== true) return say(went, true)
    if (r.choice.note) say(r.choice.note)
    else close()
  }
  const box = useRef<HTMLElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  // back from the form, the focus goes to the booking it saved, or to Mark as booked when it was left
  const form = useBookingForm(book, () => (box.current ? showBox() : pill.current?.focus({ preventScroll: true })))
  // a booked way is held: the box shows the booking and nothing under it changes the way. Opened with Change
  // booking, a way picked there opens the form on the booking, so the save changes its rows
  const { hold: held, choose } = bookedGate<WayRow>({
    booking, unlocked, pick,
    onRebook: book && booking ? (r) => form.open({
      start: 'picked', picked: dir === 'in' ? r.choice.wayIn : r.choice.wayHome, pin: r.choice, booking,
      ids: (n) => wayRebookIds(n, pair ?? { in: dir === 'in' ? booking : null, home: dir === 'home' ? booking : null }, dir),
    }) : undefined,
  })
  const showBox = () => {
    const b = box.current
    if (!b) return
    b.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    b.focus({ preventScroll: true })
  }
  const change = (on: boolean) => {
    onUnlock?.(on)
    if (!on) setAt(dayOf(way))
  }
  const links: readonly FlightLink[] = at === dayOf(way)
    ? wayLinks(way, inout, other)
    : [{ href: momondoUrl(way.from, way.to, at, tripId), site: 'Momondo', saved: false, legs: [{ from: way.from, to: way.to, date: at }] }]

  if (form.node) return form.node
  return (
    <div className="fl ws" data-booked={booking ? true : undefined}>
      <div className="fl-top">
        <header className="fl-h">
          <h3>{name(way.from)} to {name(way.to)}</h3>
          <small className="ws-sub">
            {dir === 'in' ? 'Way in' : 'Way home'}
            {onChangeEnds && !booking
              ? (
                <button type="button" className="ws-ends" title="Change start and end" aria-label={`Change start and end, ${way.from} to ${way.to}`} onClick={() => { close(); onChangeEnds() }}>
                  <b>{way.from}</b><Arrow s={12} /><b>{way.to}</b><Caret s={12} dir="d" />
                </button>
              )
              : <span className="ws-codes" role="img" aria-label={`${way.from} to ${way.to}`}><b>{way.from}</b><Arrow s={12} /><b>{way.to}</b></span>}
          </small>
        </header>
        {booking && (
          <BookedBox
            ref={box} booking={booking} data={data} changing={!!unlocked} onChange={change}
            onEdit={book ? () => form.open({ start: 'manual', edit: true, booking }) : undefined}
            onRemoved={() => say(`The booking is removed. The ${dir === 'in' ? 'way in' : 'way home'} can change again.`)}
          />
        )}
        <Days days={days} fares={fares} at={at} leg={dayOf(way)} onChange={setAt} locked={held} booked={bookedDay(booking, dayOf(way))}
          paid={booking ? paidPrice(bookings, booking) : null} trip={trip} />
        {held && trip && <DayView day={at} trip={trip} />}
        {!held && (
          <div className="fl-bar">
            <b>{weekdayDay(at)}</b>
            {rows.length > 0 && <Tip className="mk" label="Both ways, the prices are for the way in and the way home together"><span aria-hidden="true">Both ways</span></Tip>}
          </div>
        )}
        <p ref={status} className="ws-said" role="status" tabIndex={-1}>
          {said && <span key={said.n} className="ws-said-in" data-bad={said.bad || undefined}>{said.bad ? <Warn /> : <Check />}<span>{said.text}</span></span>}
        </p>
      </div>
      {!held && (
        <div className="fl-list">
          {trip && <DayView day={at} trip={trip} />}
          {rows.length === 0
            ? <div className="fl-none"><p>No ways saved for {weekdayDay(at)}</p></div>
            : <DayList key={at} rows={rows} current={way.id} booking={booking ?? null} dir={dir} other={other} data={data} name={name} onPick={choose} onDead={(why) => say(why, true)} onOpenBooking={booking ? showBox : undefined} />}
        </div>
      )}
      {!held && (
        <footer className="fl-foot">
          <FlightLinks links={links} />
          {book && !booking && remoteEnabled() && (
            <button ref={pill} type="button" className="btn small mark-booked" onClick={() => form.open({ start: 'picked', picked: way })}>
              <Check s={14} />Mark as booked
            </button>
          )}
        </footer>
      )}
    </div>
  )
}
