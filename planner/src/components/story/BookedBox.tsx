import { lazy, Suspense, useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type Ref } from 'react'
import type { Booking, BookingFile, InOut, MapNode } from '../../data/types'
import { firstOf } from '../../lib/booked'
import { fileMessage, fileTile, flightHours, type BoxChip, type BoxHead, type BoxSegment } from '../../lib/bookedBox'
import { attachFile, cancelBooking, fileUrl } from '../../lib/bookings'
import { clock, hours, kr, nextDayMark, shortPlace, thousands, weekdayDay } from '../../lib/format'
import {
  airlineLogo, cityName, codesOf, flightLabel, flightsOf, gmailLogo, mailLink, photoOf, placeOf, RELATION_TEXT, relationOf, safeLink, sellerLogo,
  ticketRows, waitHours, type JourneyFlight, type Place, type WayPair,
} from '../../lib/purchase'
import { useStore } from '../../store'
import { Arrow, Bag, Boat, Bus, Check, Clock, Copy, Doc, External, Person, Plane, Plus, Rebook, Refund, Shop, Suitcase, Ticket } from '../icons'

const JourneyMap = lazy(() => import('./JourneyMap'))

// The booked pane: one journey in front, read like a travel magazine with a boarding pass's precision. The
// journey the pane was opened on fills it: its destination as a full photo with the city set large over it, then
// the map of every airport the purchase touches, the flights of the journey as pictures when it changes plane,
// and the flight you look at with its codes large, its times and what it carries. Any other journey on the same
// purchase is one quiet row, a return named a return only when it is the trip's way home, and a press on it brings
// that journey to the front. What the purchase shares comes last and once: who sold it, the confirmation mail
// first of all, the booking number, what was paid, the terms and the files. Change booking and Remove booking
// act on the journey the pane was opened on, so they show only while it is in front.

export interface BoxData {
  inout: Pick<InOut, 'airports'>
  map: { nodes: readonly Pick<MapNode, 'id' | 'iata' | 'name' | 'country' | 'lat' | 'lon' | 'profile'>[] }
}

/** Puts a change into the store's bookings at once, so the pane agrees with what was saved before the live reload lands. */
const patch = (id: string, change: Partial<Booking>) => useStore.getState().patchBooking(id, change)

/** The city of an airport code, from the long-haul airports or the places on the map. */
export function cityOf(data: BoxData) {
  return (code: string) => {
    const name = data.inout.airports[code]?.name ?? data.map.nodes.find((n) => n.iata === code)?.name
    return name ? shortPlace(name) : null
  }
}

/**
 * The UTC offset of an airport code: its own from the long-haul airports, else that of another airport in the
 * same country, found through the map place that carries the code. null when neither is known.
 */
export function offsetOf(data: BoxData) {
  return (code: string): number | null => {
    const own = data.inout.airports[code]?.utc_offset
    if (typeof own === 'number') return own
    const country = data.map.nodes.find((n) => n.iata === code || n.id === code)?.country
    if (!country) return null
    const near = Object.values(data.inout.airports).find((a) => a.country === country && typeof a.utc_offset === 'number')
    return near ? near.utc_offset : null
  }
}

/** The mark of a later day: seen as a small +1, heard as words. */
function DayMark({ mark }: { mark: string }) {
  if (!mark) return null
  return <><sup aria-hidden="true">{mark}</sup><span className="vh">, {mark} day</span></>
}

/** A local time with its small mark, so the time is read as the airport's own. */
function Local({ time, mark }: { time: string; mark?: string }) {
  return <span className="bk-time">{time}<DayMark mark={mark ?? ''} /><i aria-hidden="true">local</i><span className="vh"> local time</span></span>
}

/**
 * The two codes large with the cities under them and the local times, as on a boarding pass. The booking form
 * shows a booking this way before it is saved.
 */
export function BoxRoute({ head, kind, took }: { head: BoxHead; kind?: string | null; took?: number | null }) {
  const Way = kind === 'bus' ? Bus : kind === 'boat' ? Boat : Plane
  const span = hours(took)
  return (
    <div className="bk-route" data-kind={kind && kind !== 'flight' ? kind : undefined}>
      <div className="bk-end">
        <b>{head.from.code || 'From'}</b>
        {head.from.city && <small title={head.from.city}>{head.from.city}</small>}
        {head.from.time && <Local time={head.from.time} />}
      </div>
      <span className="bk-fly">
        {span && <small><span className="vh">Takes </span>{span}</small>}
        <span className="bk-line" aria-hidden="true"><Way s={22} /></span>
      </span>
      <div className="bk-end to">
        <b>{head.to.code || 'To'}</b>
        {head.to.city && <small title={head.to.city}>{head.to.city}</small>}
        {head.to.time && <Local time={head.to.time} mark={head.to.mark} />}
      </div>
    </div>
  )
}

/** A copy button that turns into a check for a moment once the text is on the clipboard. */
function CopyButton({ text, label, onDone }: { text: string; label: string; onDone: (ok: boolean) => void }) {
  const [done, setDone] = useState(false)
  useEffect(() => {
    if (!done) return
    const t = window.setTimeout(() => setDone(false), 1500)
    return () => window.clearTimeout(t)
  }, [done])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      onDone(true)
    } catch {
      onDone(false)
    }
  }
  return (
    <button type="button" className="bk-icon bk-copy" data-done={done || undefined} onClick={copy} aria-label={label} title="Copy">
      <span aria-hidden="true"><Copy s={16} /></span>
      <span aria-hidden="true"><Check s={16} /></span>
    </button>
  )
}

const CHIP_ICON: Record<BoxChip['key'], (p: { s?: number }) => ReactNode> = {
  seller: Shop, paid: Ticket, cabin: Bag, checked: Suitcase, refundable: Refund, changeable: Rebook, travellers: Person,
}

/** The facts as icon chips, for the booking form. Each holds its whole fact in its tooltip and for a screen reader. */
export function BoxChips({ chips }: { chips: BoxChip[] }) {
  if (!chips.length) return null
  return (
    <ul className="bk-chips">
      {chips.map((c) => {
        const Icon = CHIP_ICON[c.key]
        return (
          <li key={c.key} className="bk-chip" data-k={c.key} data-tone={c.tone} title={c.label}>
            <Icon s={14} />
            <span aria-hidden="true">{c.text}</span>
            {c.until && <small aria-hidden="true">{c.until}</small>}
            <span className="vh">{c.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** The flights inside a booking with the time in each airport between, for the booking form. */
export function BoxSegs({ segs, label }: { segs: BoxSegment[]; label: string }) {
  if (!segs.length) return null
  return (
    <ol className="bk-segs" aria-label={label}>
      {segs.map((s, i) => s.kind === 'flight' ? (
        <li key={i}>
          <span className="bk-seg-route"><b>{s.from}</b>{s.depart && ` ${s.depart}`}<Arrow s={12} /><b>{s.to}</b>{s.arrive && ` ${s.arrive}`}<DayMark mark={s.mark} /></span>
          {s.what && <small>{s.what}</small>}
        </li>
      ) : (
        <li key={i} className="bk-stop"><Clock /><span>{s.time ? `${s.time} in ${s.airport}` : `Change in ${s.airport}`}</span></li>
      ))}
    </ol>
  )
}

function Tile({ f, onOpen }: { f: BookingFile; onOpen: (f: BookingFile) => void }) {
  const { kind, size } = fileTile(f)
  return (
    <li>
      <button type="button" className="bk-tile" onClick={() => onOpen(f)} aria-label={`Open ${f.name}, ${kind}${size ? `, ${size}` : ''}, in a new tab`}>
        <span className="bk-tile-i" aria-hidden="true"><Doc /></span>
        <b title={f.name}>{f.name}</b>
        <small>{kind}{size && `, ${size}`}</small>
      </button>
    </li>
  )
}

/** The booked mark: the green tick and the word. */
function Booked() {
  return <span className="jb-booked"><span aria-hidden="true"><Check s={11} /></span>Booked</span>
}

/** An airline or a seller as its logo on a light plate, or its name set in type when there is no logo. */
function Brand({ src, name, className }: { src: string | null; name: string; className?: string }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) return <span className={`jb-plate ${className ?? ''}`}><img src={src} alt={name} onError={() => setBroken(true)} /></span>
  return <span className={`jb-name ${className ?? ''}`}>{name}</span>
}

/** A photo that hides itself when it cannot load, so a dead link leaves the dark ground and not a broken image. */
function Photo({ url, className }: { url: string; className: string }) {
  const [ok, setOk] = useState(true)
  useEffect(() => setOk(true), [url])
  if (!ok) return null
  return <img className={className} src={url} alt="" decoding="async" onError={() => setOk(false)} />
}

/** "3 Dec" from a stamp, or null. */
const dayOf = (t: string | null) => (t && t.length >= 10 ? weekdayDay(t) : null)

/** How the journey goes: its hours and its changes, "6h 36m, one change". */
function spanText(flights: JourneyFlight[], took: number | null, word: string): string {
  const changes = flights.length - 1
  const how = changes === 0 ? 'direct' : changes === 1 ? 'one change' : `${changes} changes`
  const h = hours(took)
  return word === 'flight' ? [h, how].filter(Boolean).join(', ') : h
}

/** The journey in front: its destination as a full photo, or its code set large on the dark ground without one. */
function Hero({ from, to, codes, day, span, photo, id }: {
  from: string; to: string; codes: string[]; day: string | null; span: string; photo: string | null; id: string
}) {
  return (
    <header className="jb-hero" data-photo={photo ? true : undefined}>
      {photo ? <Photo className="jb-hero-img" url={photo} /> : <span className="jb-hero-code" aria-hidden="true">{codes[codes.length - 1]}</span>}
      <div className="jb-hero-top">
        <Booked />
        {day && <span className="jb-hero-day">{day}</span>}
      </div>
      <div className="jb-hero-txt">
        <p className="jb-from">{from} to</p>
        <h4 id={id} className="jb-to">{to}</h4>
        <p className="jb-codes">
          <span className="jb-chain" role="img" aria-label={codes.join(', ')}>{codes.map((c, i) => <span key={i}>{c}</span>)}</span>
          {span && <span className="jb-span">{span}</span>}
        </p>
      </div>
    </header>
  )
}

/** The flights of a journey that changes plane, as pictures of where each lands, with the wait between. */
function FlightStrip({ flights, at, onPick, photo, word, name }: {
  flights: JourneyFlight[]; at: number; onPick: (i: number) => void; photo: (code: string) => string | null; word: string; name: (code: string) => string
}) {
  return (
    <nav className="jb-strip" aria-label={`The ${word}s of this journey`}>
      <ol>
        {flights.map((f, i) => {
          const next = flights[i + 1]
          const wait = next ? waitHours(f.arrive, next.depart) : null
          const img = photo(f.to)
          const when = [f.depart && f.depart.length >= 16 ? clock(f.depart) : null, f.arrive && f.arrive.length >= 16 ? clock(f.arrive) : null].filter(Boolean).join(' to ')
          return (
            <li key={i}>
              <button
                type="button" className="jb-thumb" aria-pressed={i === at} onClick={() => onPick(i)}
                aria-label={`${word === 'flight' ? 'Flight' : 'Leg'} ${i + 1} of ${flights.length}, ${name(f.from)} to ${name(f.to)}${when ? `, ${when}` : ''}`}
              >
                {img ? <Photo className="jb-thumb-img" url={img} /> : <span className="jb-thumb-code" aria-hidden="true">{f.to}</span>}
                <span className="jb-thumb-n" aria-hidden="true">{i + 1}</span>
                <span className="jb-thumb-txt" aria-hidden="true"><b>{f.from}<i>›</i>{f.to}</b>{when && <small>{when}</small>}</span>
              </button>
              {next && (
                <span className="jb-wait" role="img" aria-label={`${wait != null ? hours(wait) : 'A change'} in ${name(f.to)}`}>
                  <span aria-hidden="true">{wait != null ? hours(wait) : 'Change'}</span>
                  <small aria-hidden="true">{f.to}</small>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/** The flight looked at: the airline and the number, the codes large, the times, and what this journey carries. */
function FlightRoute({ f, took, name, row, shown, kind }: {
  f: JourneyFlight; took: number | null; name: (code: string) => string; row: Booking
  /** the booking number the purchase shows, so the airline's own reference is not said twice */
  shown: string | null
  kind: string
}) {
  const label = flightLabel(f)
  const carrier = f.carrier
  const logo = kind === 'flight' ? airlineLogo(f.code, f.carrier) : null
  const ref = row.reference?.trim() || null
  const facts: [string, string, boolean?][] = []
  if (ref && ref !== shown) facts.push([`${carrier ?? (kind === 'flight' ? 'Airline' : 'Operator')} reference`, ref, true])
  if (row.fare?.trim()) facts.push(['Fare', row.fare.trim()])
  if (row.cabin_bag?.trim()) facts.push(['Cabin bag', row.cabin_bag.trim()])
  if (row.checked_bag?.trim()) facts.push(['Checked bag', row.checked_bag.trim()])
  const dep = f.depart && f.depart.length >= 16 ? clock(f.depart) : null
  const arr = f.arrive && f.arrive.length >= 16 ? clock(f.arrive) : null
  const mark = f.depart && f.arrive ? nextDayMark(f.depart, f.arrive) : ''
  const Way = kind === 'bus' ? Bus : kind === 'boat' ? Boat : Plane
  return (
    <section className="jb-flight" aria-label={`${label ?? 'The way'}, ${name(f.from)} to ${name(f.to)}`}>
      {(logo || carrier || label || f.operatedBy) && (
        <div className="jb-air">
          {logo ? <Brand src={logo} name={carrier ?? f.code ?? 'Airline'} /> : carrier && <span className="jb-name">{carrier}</span>}
          {label && <b className="jb-num">{label}</b>}
          {f.operatedBy && <span className="jb-op">Operated by {f.operatedBy}</span>}
        </div>
      )}
      <div className="jb-codes-row">
        <b className="jb-code">{f.from}</b>
        <span className="jb-line" aria-hidden="true">
          {took != null && <small>{hours(took)}</small>}
          <span><i /><Way s={14} /><i /></span>
        </span>
        <b className="jb-code to">{f.to}</b>
      </div>
      {took != null && <span className="vh">Takes {hours(took)}</span>}
      <div className="jb-times">
        <div>
          {dep && <b>{dep}</b>}
          <small>{name(f.from)}{f.depart ? `, ${weekdayDay(f.depart)}` : ''}</small>
        </div>
        <div className="to">
          {arr && <b>{arr}<DayMark mark={mark} /></b>}
          <small>{name(f.to)}{mark && f.arrive ? `, ${weekdayDay(f.arrive)}` : ''}</small>
        </div>
      </div>
      {facts.length > 0 && (
        <dl className="jb-facts">
          {facts.map(([k, v, mono]) => <div key={k}><dt>{k}</dt><dd data-mono={mono || undefined}>{v}</dd></div>)}
        </dl>
      )}
    </section>
  )
}

const REFUND: Record<string, string> = { yes: 'Yes', no: 'No', partly: 'Partly' }
const CHANGE: Record<string, string> = { yes: 'Yes', no: 'No', fee: 'For a fee' }
const terms = (answer: string | null | undefined, until: string | null) => {
  const last = until ? weekdayDay(until) : null
  if (answer && last) return answer === 'No' ? answer : `${answer}, until ${last}`
  return answer ?? (last ? `Until ${last}` : null)
}

/** An amount in its own currency, Danish style. */
function amount(n: number): string {
  const cents = Math.round(Math.abs(n) * 100) % 100
  return cents ? `${thousands(Math.trunc(n))},${String(cents).padStart(2, '0')}` : thousands(n)
}

export function BookedBox({ booking: b, data, changing, onChange, onEdit, onRemoved, ways, ref }: {
  booking: Booking
  data: BoxData
  /** the days and the flights under the pane are open */
  changing: boolean
  /** Change booking and Done. Left out where nothing under the pane opens, a bus or a boat, and the button goes with it */
  onChange?: (on: boolean) => void
  /** opens the booking form filled from the row */
  onEdit?: () => void
  /** after the booking is cancelled, so the sheet can say so */
  onRemoved?: () => void
  /** the trip's way in and way home, when the pane is one of them: what makes another journey a return */
  ways?: WayPair | null
  ref?: Ref<HTMLElement>
}) {
  const id = useId()
  const bookings = useStore((st) => st.bookings)
  const others = useMemo(() => ticketRows(b, bookings), [b, bookings])
  const [front, setFront] = useState(b.id)
  const row = front === b.id ? b : others.find((r) => r.id === front) ?? b
  const home = row.id === b.id
  const [at, setAt] = useState(0)
  useEffect(() => setAt(0), [row.id])
  const top = useRef<HTMLDivElement>(null)

  const offset = useMemo(() => offsetOf(data), [data])
  const name = (code: string) => cityName(code, data)
  const word = row.kind === 'flight' ? 'flight' : 'leg'
  const flights = flightsOf(row)
  const f = flights[Math.min(at, Math.max(0, flights.length - 1))] ?? null
  const codes = codesOf(flights)
  const took = flightHours(row, offset)
  const photo = (code: string) => photoOf(code, data)?.url ?? null

  // every journey of the purchase on the map, this one first
  const group = useMemo(() => [b, ...others], [b, others])
  const journeys = useMemo(() => group.map((r) => ({ id: r.id, flights: flightsOf(r).map((x) => ({ from: x.from, to: x.to })) })), [group])
  const places = useMemo(() => {
    const out: Record<string, Place> = {}
    for (const j of journeys) for (const x of j.flights) for (const c of [x.from, x.to]) {
      if (out[c]) continue
      const p = placeOf(c, data)
      if (p) out[c] = p
    }
    return out
  }, [journeys, data])

  const show = (rid: string) => {
    setFront(rid)
    top.current?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }

  // the purchase: whoever sold it, the number they gave it, what was paid by the row that holds the price
  const payer = firstOf(group)
  const seller = b.seller?.trim() || null
  // the seller's own number, or the airline's reference when the airline sold it. The flight shows the airline's only when it differs
  const number = b.seller_reference?.trim() || b.reference?.trim() || null
  const paid = payer.price_dkk != null && Number.isFinite(payer.price_dkk) && payer.price_dkk > 0 ? kr(payer.price_dkk) : null
  const cur = payer.currency?.toUpperCase()
  const paidAs = paid && payer.price != null && cur && cur !== 'DKK' ? `Paid as ${amount(payer.price)} ${cur}` : null
  const count = group.reduce((n, r) => n + Math.max(1, flightsOf(r).length), 0)
  const returns = others.some((o) => relationOf(b, o, ways) !== 'also')
  const covers = returns ? 'Both ways' : count > 1 ? `${count} ${b.kind === 'flight' ? 'flights' : 'legs'}` : null
  const mail = mailLink(b)
  const page = safeLink(b.url)
  const refund = terms(b.refundable && REFUND[b.refundable], b.cancel_until)
  const change = terms(b.changeable && CHANGE[b.changeable], b.change_until)
  const files = useMemo(() => {
    const seen = new Set<string>()
    return group.flatMap((r) => r.attachments).filter((a) => (seen.has(a.path) ? false : (seen.add(a.path), true)))
  }, [group])

  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const keep = useRef<HTMLButtonElement>(null)
  const remove = useRef<HTMLButtonElement>(null)
  // the question takes the focus to its safe answer, and Keep booking gives it back to Remove booking
  const asked = useRef(false)
  useEffect(() => {
    if (asking) keep.current?.focus()
    else if (asked.current) remove.current?.focus()
    asked.current = asking
  }, [asking])

  const copied = (what: string, ok: boolean) =>
    setSaid(ok ? { text: `${what} copied.` } : { text: `Copying did not work. Select the ${what.toLowerCase()} and copy it by hand.`, bad: true })

  const open = async (file: BookingFile) => {
    // the tab opens on the press, so no popup blocker stops it, and gets its address once the bucket gives one
    const tab = window.open('', '_blank')
    if (tab) tab.opener = null
    const url = await fileUrl(file.path)
    if (url && tab) {
      tab.location.href = url
      return
    }
    tab?.close()
    setSaid({ text: url ? 'The browser kept the file from opening in a new tab.' : `${file.name} could not be opened. Try again.`, bad: true })
  }

  const add = async (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget
    const file = input.files?.[0] ?? null
    input.value = ''
    const problem = fileMessage(file)
    if (problem || !file) {
      setSaid({ text: problem ?? 'Choose a PDF or a photo to add.', bad: true })
      return
    }
    setAdding(file.name)
    setSaid(null)
    const r = await attachFile(b.id, file)
    setAdding(null)
    if (!r.ok) return setSaid({ text: r.message, bad: true })
    patch(b.id, { attachments: b.attachments.filter((a) => a.path !== r.attachment.path).concat(r.attachment) })
    setSaid({ text: `${file.name} added.` })
  }

  const cancel = async () => {
    setRemoving(true)
    const r = await cancelBooking(b.id)
    setRemoving(false)
    if (!r.ok) {
      setAsking(false)
      return setSaid({ text: r.message, bad: true })
    }
    if (changing) onChange?.(false)
    patch(b.id, { status: 'cancelled' })
    onRemoved?.()
  }

  const from = codes.length ? name(codes[0]) : row.from_code ?? 'From'
  const to = codes.length ? name(codes[codes.length - 1]) : row.to_code ?? 'To'
  const hasMap = Object.keys(places).length > 1

  return (
    <section ref={ref} className="jb" data-kind={row.kind} aria-labelledby={`${id}-h`} tabIndex={-1}>
      <div className="jb-in">
      <div ref={top} className="jb-vis">
        <Hero id={`${id}-h`} from={from} to={to} codes={codes} day={dayOf(row.depart)} span={spanText(flights, took, word)} photo={codes.length ? photo(codes[codes.length - 1]) : null} />
        {hasMap && (
          <figure className="jb-map" aria-label="Map of the journeys on this purchase">
            <Suspense fallback={<div className="jm" aria-hidden="true" />}>
              <JourneyMap journeys={journeys} active={row.id} flight={at} places={places} onFlight={setAt} onJourney={show} />
            </Suspense>
          </figure>
        )}
      </div>

      <div className="jb-info">
        {flights.length > 1 && <FlightStrip flights={flights} at={at} onPick={setAt} photo={photo} word={word} name={name} />}
        {f && <FlightRoute key={`${row.id}-${at}`} f={f} took={flightHours({ from_code: f.from, to_code: f.to, depart: f.depart, arrive: f.arrive }, offset)} name={name} row={row} shown={number} kind={row.kind} />}

        {(others.length > 0 || !home) && (
          <section className="jb-also" aria-label="The other journeys on this purchase">
            {[b, ...others].filter((r) => r.id !== row.id).map((r) => {
              const rel = r.id === b.id ? 'this' : relationOf(b, r, ways)
              const c = codesOf(flightsOf(r))
              const day = dayOf(r.depart)
              const head = rel === 'this' ? 'Where you opened it' : RELATION_TEXT[rel]
              return (
                <button key={r.id} type="button" className="jb-row" onClick={() => show(r.id)}
                  aria-label={`${head}, booked, ${c.length ? `${name(c[0])} to ${name(c[c.length - 1])}` : 'a journey'}${day ? `, ${day}` : ''}. Show it`}>
                  <span className="jb-row-tick" aria-hidden="true"><Check s={10} /></span>
                  <span className="jb-row-txt" aria-hidden="true">
                    <small>{head}</small>
                    <b>{c.map((x, i) => <span key={i}>{x}</span>)}</b>
                  </span>
                  {day && <span className="jb-row-day" aria-hidden="true">{day}</span>}
                  <svg className="jb-row-go" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5L6.5 7l-5 5.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
                </button>
              )
            })}
          </section>
        )}

        <section className="jb-buy" aria-labelledby={`${id}-buy`}>
          <h5 id={`${id}-buy`} className="vh">The purchase</h5>
          <div className="jb-buy-top">
            {seller ? <Brand src={sellerLogo(seller)} name={seller} className="jb-seller" /> : <span className="jb-name jb-seller">Booked</span>}
            {paid && (
              <span className="jb-paid">
                <b>{paid}</b>
                {(covers || paidAs) && <small>{[covers, paidAs].filter(Boolean).join(', ')}</small>}
              </span>
            )}
          </div>

          {mail ? (
            <a className="jb-mail" href={mail} target="_blank" rel="noopener noreferrer">
              <img src={gmailLogo()} alt="" />
              <span><b>Confirmation mail</b><small>{seller ? `From ${seller}` : 'Opens in Gmail'}</small></span>
              <External s={14} />
              <span className="vh">, opens in a new tab</span>
            </a>
          ) : onEdit && (
            <button type="button" className="jb-mail" data-empty onClick={onEdit}>
              <img src={gmailLogo()} alt="" />
              <span><b>Add the confirmation mail</b><small>Paste its link from Gmail</small></span>
              <Plus />
            </button>
          )}

          <dl className="jb-terms">
            {number && (
              <div className="jb-num-row">
                <dt>Booking number</dt>
                <dd><code className="bk-code">{number}</code><CopyButton text={number} label="Copy the booking number" onDone={(ok) => copied('Booking number', ok)} /></dd>
              </div>
            )}
            {change && <div><dt>Changes</dt><dd>{change}</dd></div>}
            {refund && <div><dt>Refund</dt><dd>{refund}</dd></div>}
            {b.travellers > 1 && <div><dt>Travellers</dt><dd>{b.travellers}</dd></div>}
          </dl>

          {page && <a className="jb-page" href={page} target="_blank" rel="noopener noreferrer">{seller ? `Open at ${seller}` : 'Open the booking'}<External s={12} /><span className="vh">, in a new tab</span></a>}

          <ul className="bk-files jb-files" aria-label="Files">
            {files.map((x) => <Tile key={x.path} f={x} onOpen={open} />)}
            {home && (
              <li>
                <label className="bk-tile bk-add" data-busy={adding ? true : undefined}>
                  <input type="file" accept="application/pdf,image/*" onChange={add} disabled={!!adding} aria-describedby={`${id}-add`} />
                  <span className="bk-tile-i" aria-hidden="true"><Plus /></span>
                  <b>{adding ? `Adding ${adding}` : 'Add a file'}</b>
                  <small id={`${id}-add`}>PDF or photo, up to 10 MB</small>
                </label>
              </li>
            )}
          </ul>

          {b.notes && b.notes.trim() && <p className="jb-notes">{b.notes.trim()}</p>}

          <p className="bk-said" role="status" data-bad={said?.bad || undefined}>{said?.text}</p>

          {home && (asking ? (
            <div className="bk-ask" role="group" aria-labelledby={`${id}-ask`}>
              <p id={`${id}-ask`}>Remove this booking. It is kept as cancelled and the leg can change again.</p>
              <div className="bk-acts">
                <button type="button" className="btn small bk-confirm" onClick={cancel} disabled={removing}>{removing ? 'Removing' : 'Remove booking'}</button>
                <button ref={keep} type="button" className="btn small" onClick={() => setAsking(false)} disabled={removing}>Keep booking</button>
              </div>
            </div>
          ) : (
            <div className="bk-acts">
              {onChange && <button type="button" className="btn small bk-change" data-on={changing || undefined} onClick={() => onChange(!changing)}>{changing ? 'Done' : 'Change booking'}</button>}
              {onEdit && <button type="button" className="btn small" onClick={onEdit}>Edit details</button>}
              <button ref={remove} type="button" className="btn link small bk-remove" onClick={() => setAsking(true)}>Remove booking</button>
            </div>
          ))}
        </section>
      </div>
      </div>
    </section>
  )
}
