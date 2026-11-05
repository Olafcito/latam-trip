import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode, type Ref } from 'react'
import type { Booking, BookingFile, InOut, MapNode } from '../../data/types'
import { firstOf } from '../../lib/booked'
import { fileMessage, fileTile, flightHours, type BoxChip, type BoxHead, type BoxSegment } from '../../lib/bookedBox'
import { attachFile, cancelBooking, fileUrl, saveBookings } from '../../lib/bookings'
import { clock, dayDiff, hours, kr, nextDayMark, shortPlace, thousands, weekdayDay } from '../../lib/format'
import {
  airlineLogo, cityName, codesOf, flightLabel, flightsOf, gmailLogo, mailLink, photoOf, relationOf, sellerLogo, ticketRows, waitHours,
  type JourneyFlight, type WayPair,
} from '../../lib/purchase'
import { useStore } from '../../store'
import { Arrow, ArrowUpRight, Bag, Boat, Bus, Check, Clock, Copy, Doc, Moon, Pencil, Person, Plane, Plus, Rebook, Refund, Shop, Suitcase, Ticket } from '../icons'
import type { LegStay } from './FlightSheet'
import { Tip } from './Marks'

// The booked pane: the journey the pane was opened on, read at a glance. A short photo of where it lands with the
// city and the nights there, then the day and the time it takes, a card per flight with the airline, the two times
// and codes and the time in the air, and the wait between flights on a line of its own. What the ticket includes is
// three marks, filled when it is there. The purchase comes after, once: who sold it and what was paid, the
// confirmation mail, the numbers to copy, and every other journey of the same purchase as one row with a way to it.

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

/** The two codes large with the cities under them and the local times, for the booking form. */
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

/** The green tick of a booked journey. */
const Tick = ({ s = 10 }: { s?: number }) => <span className="jb-tick" aria-hidden="true"><Check s={s} /></span>

/** A logo on a light plate, or the name set in type when there is no logo or it does not load. */
function Brand({ src, name, size }: { src: string | null; name: string; size?: 'seller' }) {
  const [broken, setBroken] = useState(false)
  useEffect(() => setBroken(false), [src])
  if (size === 'seller') {
    // the seller is named in type beside its mark, as the sites list them, so the name stays when the mark does not load
    return (
      <span className="jb-seller-id">
        {src && !broken && <span className="jb-brand" data-size="seller"><img src={src} alt="" onError={() => setBroken(true)} /></span>}
        <b>{name}</b>
      </span>
    )
  }
  if (src && !broken) return <span className="jb-brand"><img src={src} alt={name} onError={() => setBroken(true)} /></span>
  return <span className="jb-brand-name">{name}</span>
}

/** "Tue 8 Dec" from a stamp, or null without a day. */
const dayOf = (t: string | null | undefined) => (t && t.length >= 10 ? weekdayDay(t) : null)
const timeOf = (t: string | null) => (t && t.length >= 16 ? clock(t) : null)

/** Whether the ticket has it: yes, no, or not saved. */
type Has = 'yes' | 'no' | 'unknown'
function bagHas(text: string | null | undefined): Has {
  const t = text?.trim()
  if (!t) return 'unknown'
  return /^(no|none|not|0\b|ingen)/i.test(t) ? 'no' : 'yes'
}
/** "10 kg" out of a bag's text, or null. */
const weightOf = (text: string | null | undefined) => text?.match(/(\d+(?:[.,]\d+)?)\s*kg/i)?.[1].replace('.', ',') ?? null

const CHANGE_TEXT: Record<string, string> = { yes: 'Changes allowed', fee: 'Changes for a fee', no: 'No changes' }
const REFUND_TEXT: Record<string, string> = { yes: 'Refundable', partly: 'Partly refundable', no: 'Not refundable' }

/** One mark of what the ticket includes: filled when it is there, a ring when it is not, its whole fact in its tooltip. */
function Include({ has, icon, label, fact }: { has: Has; icon: ReactNode; label: string; fact: string }) {
  return (
    <li className="jb-inc" data-has={has}>
      <Tip label={fact} className="jb-inc-tip"><span className="jb-inc-i" aria-hidden="true">{icon}</span></Tip>
      <span className="jb-inc-l" aria-hidden="true">{label}</span>
    </li>
  )
}

/** One flight: the airline and its number at the left, the two times and codes, the time in the air between. */
function FlightCard({ f, took, kind }: { f: JourneyFlight; took: number | null; kind: string }) {
  const label = flightLabel(f)
  const logo = kind === 'flight' ? airlineLogo(f.code, f.carrier, { on: 'dark' }) : null
  const who = f.carrier ?? f.code ?? null
  const dep = timeOf(f.depart)
  const arr = timeOf(f.arrive)
  const mark = f.depart && f.arrive ? nextDayMark(f.depart, f.arrive) : ''
  const Way = kind === 'bus' ? Bus : kind === 'boat' ? Boat : Plane
  const aria = [who, label, `${f.from}${dep ? ` ${dep}` : ''} to ${f.to}${arr ? ` ${arr}` : ''}${mark ? `, ${mark} day` : ''}`, took != null ? hours(took) : null].filter(Boolean).join(', ')
  return (
    <li className="jb-card" aria-label={aria}>
      <div className="jb-card-air" aria-hidden="true">
        {logo ? <Brand src={logo} name={who ?? 'Airline'} /> : who && <span className="jb-brand-name">{who}</span>}
        {label && <small>{label}</small>}
      </div>
      <div className="jb-card-end" aria-hidden="true">
        <b>{dep ?? f.from}</b>
        {dep && <span>{f.from}</span>}
      </div>
      <div className="jb-card-mid" aria-hidden="true">
        {took != null && <small>{hours(took)}</small>}
        <span data-kind={kind}><i /><Way s={16} /><i /></span>
      </div>
      <div className="jb-card-end to" aria-hidden="true">
        <b>{arr ?? f.to}{arr && mark && <sup>{mark}</sup>}</b>
        {arr && <span>{f.to}</span>}
      </div>
    </li>
  )
}

/** What another journey of the purchase is to the one on screen. A return only through the trip's way in and way home. */
function relationText(here: Booking, other: Booking, ways: WayPair | null | undefined): string {
  const rel = relationOf(here, other, ways)
  if (rel === 'return') return 'Return flight'
  if (rel === 'outbound') return 'Outbound flight'
  const word = other.kind === 'flight' ? 'flight' : 'journey'
  const earlier = (other.depart ?? '￿') < (here.depart ?? '￿')
  return earlier ? `Inbound ${word}` : `Onward ${word}`
}

/** An amount in its own currency, Danish style. */
function amount(n: number): string {
  const cents = Math.round(Math.abs(n) * 100) % 100
  return cents ? `${thousands(Math.trunc(n))},${String(cents).padStart(2, '0')}` : thousands(n)
}

export function BookedBox({ booking: b, data, changing, onChange, onEdit, onRemoved, ways, stay, ref }: {
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
  /** the nights on either side of the journey, for the nights where it lands */
  stay?: LegStay
  ref?: Ref<HTMLElement>
}) {
  const id = useId()
  const bookings = useStore((st) => st.bookings)
  const others = useMemo(() => ticketRows(b, bookings), [b, bookings])
  const group = useMemo(() => [b, ...others], [b, others])
  const offset = useMemo(() => offsetOf(data), [data])

  const flights = flightsOf(b)
  const codes = codesOf(flights)
  const first = codes[0] ?? b.from_code ?? ''
  const last = codes[codes.length - 1] ?? b.to_code ?? ''
  const from = first ? cityName(first, data) : 'From'
  const to = last ? cityName(last, data) : 'To'
  const photo = last ? photoOf(last, data)?.url ?? null : null
  const [photoOk, setPhotoOk] = useState(true)
  useEffect(() => setPhotoOk(true), [photo])
  const took = flightHours(b, offset)
  const landed = (b.arrive ?? b.depart)?.slice(0, 10)
  const nights = stay && !stay.toHome && !stay.onward && landed ? dayDiff(landed, stay.nextDay) : null

  // the purchase: whoever sold it, the number they gave it, and the price, held by the first row of the ticket
  const payer = firstOf(group)
  const seller = b.seller?.trim() || null
  const number = b.seller_reference?.trim() || b.reference?.trim() || null
  const airlineRef = b.reference?.trim() && b.reference.trim() !== number ? b.reference.trim() : null
  const airlineName = flights.find((f) => f.carrier)?.carrier ?? (b.kind === 'flight' ? 'Airline' : 'Operator')
  const paid = payer.price_dkk != null && Number.isFinite(payer.price_dkk) && payer.price_dkk > 0 ? kr(payer.price_dkk) : null
  const cur = payer.currency?.toUpperCase()
  const paidAs = paid && payer.price != null && cur && cur !== 'DKK' ? `${amount(payer.price)} ${cur}` : null
  const mail = mailLink(b)
  const files = useMemo(() => {
    const seen = new Set<string>()
    return group.flatMap((r) => r.attachments).filter((a) => (seen.has(a.path) ? false : (seen.add(a.path), true)))
  }, [group])

  const cabin = bagHas(b.cabin_bag)
  const checked = bagHas(b.checked_bag)
  const flex: Has = b.changeable === 'yes' || b.changeable === 'fee' ? 'yes' : b.changeable === 'no' ? 'no' : 'unknown'
  const until = (t: string | null) => (t ? `, until ${weekdayDay(t)}` : '')
  const flexFact = [
    b.changeable ? `${CHANGE_TEXT[b.changeable]}${b.changeable !== 'no' ? until(b.change_until) : ''}` : 'Changes not saved',
    b.refundable ? `${REFUND_TEXT[b.refundable]}${b.refundable !== 'no' ? until(b.cancel_until) : ''}` : null,
  ].filter(Boolean).join('. ')
  const cabinKg = weightOf(b.cabin_bag)
  const checkedKg = weightOf(b.checked_bag)

  const [said, setSaid] = useState<{ text: string; bad?: boolean } | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [asking, setAsking] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [mailing, setMailing] = useState(false)
  const [mailText, setMailText] = useState('')
  const [mailBusy, setMailBusy] = useState(false)
  const keep = useRef<HTMLButtonElement>(null)
  const remove = useRef<HTMLButtonElement>(null)
  const mailInput = useRef<HTMLInputElement>(null)
  const mailBtn = useRef<HTMLButtonElement>(null)
  // the question takes the focus to its safe answer, and Keep booking gives it back to Remove booking
  const asked = useRef(false)
  useEffect(() => {
    if (asking) keep.current?.focus()
    else if (asked.current) remove.current?.focus()
    asked.current = asking
  }, [asking])
  useEffect(() => { if (mailing) mailInput.current?.focus() }, [mailing])

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

  const saveMail = async (e: FormEvent) => {
    e.preventDefault()
    const url = mailText.trim()
    if (!/^https:\/\/\S+$/i.test(url)) return setSaid({ text: 'Paste the link of the mail, starting with https://', bad: true })
    setMailBusy(true)
    // the whole purchase shares its mail
    const r = await saveBookings(group.map((row) => ({ id: row.id, mail_url: url })))
    setMailBusy(false)
    if (!r.ok) return setSaid({ text: r.message, bad: true })
    for (const row of group) patch(row.id, { mail_url: url })
    setMailing(false)
    setMailText('')
    setSaid({ text: 'Confirmation mail added.' })
  }
  const stopMail = () => {
    setMailing(false)
    setMailText('')
    requestAnimationFrame(() => mailBtn.current?.focus())
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

  const show = (rid: string) => useStore.getState().setFocusBooking(rid)

  return (
    <section ref={ref} className="jb" data-kind={b.kind} aria-labelledby={`${id}-h`} tabIndex={-1}>
      <header className="jb-hero" data-photo={photo && photoOk ? true : undefined}>
        {photo && photoOk && <img className="jb-hero-img" src={photo} alt="" decoding="async" onError={() => setPhotoOk(false)} />}
        <span className="jb-booked"><Tick s={9} />Booked</span>
        <div className="jb-hero-txt">
          <div>
            <p>{from} to</p>
            <h4 id={`${id}-h`}>{to}</h4>
          </div>
          {nights != null && nights > 0 && <span className="jb-nights"><Moon />{nights === 1 ? '1 night' : `${nights} nights`}</span>}
        </div>
      </header>

      <div className="jb-body">
        {(dayOf(b.depart) || took != null) && (
          <div className="jb-day">
            {dayOf(b.depart) && <b>{dayOf(b.depart)}</b>}
            {took != null && <span>{hours(took)} total</span>}
          </div>
        )}

        <ol className="jb-cards" aria-label={b.kind === 'flight' ? 'Flights' : 'Legs'}>
          {flights.map((f, i) => {
            const next = flights[i + 1]
            const wait = next ? waitHours(f.arrive, next.depart) : null
            return [
              <FlightCard key={`f${i}`} f={f} kind={b.kind} took={flightHours({ from_code: f.from, to_code: f.to, depart: f.depart, arrive: f.arrive }, offset)} />,
              next && (
                <li key={`w${i}`} className="jb-wait">
                  <span><Clock s={15} />{wait != null ? `${hours(wait)} in ${cityName(f.to, data)}` : `Change in ${cityName(f.to, data)}`}</span>
                </li>
              ),
            ]
          })}
        </ol>

        <ul className="jb-incs" aria-label="What the ticket includes">
          <Include has={cabin} icon={<Bag s={20} />} label={cabinKg ? `Cabin ${cabinKg} kg` : 'Cabin'} fact={b.cabin_bag?.trim() ? `Cabin bag, ${b.cabin_bag.trim()}` : 'Cabin bag not saved'} />
          <Include has={checked} icon={<Suitcase s={20} />} label={checkedKg ? `Checked ${checkedKg} kg` : 'Checked'} fact={b.checked_bag?.trim() ? `Checked bag, ${b.checked_bag.trim()}` : 'Checked bag not saved'} />
          <Include has={flex} icon={<Rebook s={20} />} label="Flexible" fact={flexFact} />
        </ul>
      </div>

      <section className="jb-buy" aria-labelledby={`${id}-buy`}>
        <h5 id={`${id}-buy`} className="vh">The purchase</h5>
        <div className="jb-seller">
          {seller && <Brand src={sellerLogo(seller)} name={seller} size="seller" />}
          {paid && <span className="jb-paid"><b>{paid}</b>{paidAs && <small>{paidAs}</small>}</span>}
        </div>

        {mail ? (
          <a className="jb-mail" href={mail} target="_blank" rel="noopener noreferrer">
            <img src={gmailLogo()} alt="" />
            <span><b>Confirmation mail</b><small>Opens in Gmail</small></span>
            <ArrowUpRight />
            <span className="vh">, in a new tab</span>
          </a>
        ) : mailing ? (
          <form className="jb-mail-add" onSubmit={saveMail}>
            <label htmlFor={`${id}-mail`}>Link to the confirmation mail</label>
            <input ref={mailInput} id={`${id}-mail`} type="url" inputMode="url" placeholder="https://mail.google.com/..." value={mailText} onChange={(e) => setMailText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); stopMail() } }} />
            <div className="bk-acts">
              <button type="submit" className="btn small jb-save" disabled={mailBusy}>{mailBusy ? 'Saving' : 'Save'}</button>
              <button type="button" className="btn link small" onClick={stopMail} disabled={mailBusy}>Cancel</button>
            </div>
          </form>
        ) : (
          <button ref={mailBtn} type="button" className="jb-mail" data-empty onClick={() => setMailing(true)}>
            <img src={gmailLogo()} alt="" />
            <span><b>Confirmation mail</b><small>Add email</small></span>
            <Plus />
          </button>
        )}

        <dl className="jb-refs">
          {number && (
            <div>
              <dt>Booking number</dt>
              <dd><code>{number}</code><CopyButton text={number} label="Copy the booking number" onDone={(ok) => copied('Booking number', ok)} /></dd>
            </div>
          )}
          {airlineRef && (
            <div>
              <dt>{airlineName} reference</dt>
              <dd><code>{airlineRef}</code><CopyButton text={airlineRef} label={`Copy the ${airlineName} reference`} onDone={(ok) => copied('Reference', ok)} /></dd>
            </div>
          )}
          {b.travellers > 1 && <div><dt>Travellers</dt><dd><code>{b.travellers}</code></dd></div>}
        </dl>

        {others.length > 0 && (
          <ul className="jb-others" aria-label="Other journeys on this purchase">
            {others.map((r) => {
              const c = codesOf(flightsOf(r))
              const a = c[0] ?? r.from_code
              const z = c[c.length - 1] ?? r.to_code
              const what = relationText(b, r, ways)
              const route = `${a ? cityName(a, data) : 'From'} → ${z ? cityName(z, data) : 'To'}`
              const day = dayOf(r.depart)
              // the trip shows a journey of its own trip only, so the way to it is there when both are in one
              const reach = r.trip_id != null && r.trip_id === b.trip_id
              return (
                <li key={r.id} className="jb-other">
                  <span className="jb-other-tick" role="img" aria-label="Booked"><Tick /></span>
                  <span className="jb-other-txt"><small>{what}</small><b>{route}</b></span>
                  {day && <span className="jb-other-day">{day}</span>}
                  {reach && (
                    <button type="button" className="jb-go" onClick={() => show(r.id)} aria-label={`Show ${route.replace(' → ', ' to ')}${day ? `, ${day}` : ''} in the trip`} title="Show in the trip">
                      <ArrowUpRight />
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {(files.length > 0 || adding !== null) && (
          <ul className="bk-files jb-files" aria-label="Files">
            {files.map((x) => <Tile key={x.path} f={x} onOpen={open} />)}
          </ul>
        )}
        {b.notes && b.notes.trim() && <p className="jb-notes">{b.notes.trim()}</p>}

        <p className="bk-said" role="status" data-bad={said?.bad || undefined}>{said?.text}</p>

        {asking ? (
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
            {onEdit && <button type="button" className="bk-icon jb-act" onClick={onEdit} aria-label="Edit the booking details" title="Edit the booking details"><Pencil s={16} /></button>}
            <label className="bk-icon jb-act jb-file" data-busy={adding ? true : undefined} title={adding ? `Adding ${adding}` : 'Add a file'}>
              <input type="file" accept="application/pdf,image/*" onChange={add} disabled={!!adding} className="vh" aria-label={adding ? `Adding ${adding}` : 'Add a file, a PDF or a photo up to 10 MB'} />
              <Doc s={16} />
            </label>
            <button ref={remove} type="button" className="btn link small bk-remove" onClick={() => setAsking(true)}>Remove booking</button>
          </div>
        )}
      </section>
    </section>
  )
}
