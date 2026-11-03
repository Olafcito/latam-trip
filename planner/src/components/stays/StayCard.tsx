import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Booking, Lodging, LodgingRoom, LodgingSite, LodgingTag } from '../../data/types'
import { dayRange, dec1, kr, thousands } from '../../lib/format'
import { priceFor, type StayPrice } from '../../lib/stays'
import { askLabel, insertTask, press, stayPricesTask, type AskState } from '../../lib/tasks'
import { useStore } from '../../store'
import { Bath, Bed, Caret, Check, Door, External, Note, Person, Pin, Star, Wave } from '../icons'
import { Tip } from '../story/Marks'

// A place to stay as a card: its photos as a strip that swipes, the name and kind with the rating on the photo,
// how far it is as marks, its rooms as rows priced for the nights, its links and the notes. A room row is the
// control that picks it. A booked place wears the green ring of a booked leg, with its reference.

const KIND: Record<Lodging['kind'], string> = { hostel: 'Hostel', hotel: 'Hotel', guesthouse: 'Guesthouse', apartment: 'Apartment', other: 'Place to stay' }
const TAG: Record<LodgingTag, string> = { beach: 'Beach', pool: 'Pool', social: 'Social', quiet: 'Quiet', kitchen: 'Kitchen', breakfast: 'Breakfast', aircon: 'Air con', workspace: 'Workspace' }
const SITE: Record<LodgingSite, string> = { booking: 'Booking.com', hostelworld: 'Hostelworld', airbnb: 'Airbnb', own: 'Own site', other: 'Link' }

/** A web address the card may link to or load. Anything else, a javascript: one too, gives nothing. */
export const safeUrl = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null)

/** The name of a link: the site, or for any other the host of its address. */
function linkName(site: LodgingSite, url: string) {
  if (site !== 'other') return SITE[site]
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return SITE.other
  }
}

/** How far to a place, as the mark says it and in full. Under 100 m it is there. */
function distance(km: number, where: 'centre' | 'beach'): { text: string; label: string } {
  if (km < 0.1) return where === 'beach' ? { text: 'on the beach', label: 'On the beach' } : { text: 'in the centre', label: 'In the centre' }
  const d = km < 1 ? `${Math.round(km * 1000 / 50) * 50} m` : `${dec1(km)} km`
  return { text: d, label: `${d} to ${where === 'beach' ? 'the beach' : 'centre'}` }
}

function Photos({ lodging }: { lodging: Lodging }) {
  const [broken, setBroken] = useState<Set<string>>(() => new Set())
  const [at, setAt] = useState(0)
  const strip = useRef<HTMLDivElement>(null)
  const frame = useRef(0)
  const shown = lodging.photos.filter((p) => safeUrl(p.url) && !broken.has(p.url))
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  if (!shown.length) return null
  const onScroll = () => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(() => {
      const el = strip.current
      if (el) setAt(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    })
  }
  const go = (by: 1 | -1) => {
    const el = strip.current
    if (!el) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: by * el.clientWidth, behavior: still ? 'auto' : 'smooth' })
  }
  const many = shown.length > 1
  return (
    <div className="sc-ph">
      <div ref={strip} className="sc-strip" tabIndex={many ? 0 : undefined} role={many ? 'group' : undefined} aria-label={many ? `Photos of ${lodging.name}` : undefined} onScroll={many ? onScroll : undefined}>
        {shown.map((p, i) => (
          <img
            key={p.url}
            src={safeUrl(p.url)!}
            alt={p.caption || (many ? `${lodging.name}, photo ${i + 1} of ${shown.length}` : lodging.name)}
            loading="lazy"
            decoding="async"
            draggable={false}
            onError={() => setBroken((b) => new Set(b).add(p.url))}
          />
        ))}
      </div>
      {many && (
        <>
          <button type="button" className="sc-flip" data-dir="l" aria-label="Previous photo" disabled={at <= 0} onClick={() => go(-1)}><Caret dir="l" s={16} /></button>
          <button type="button" className="sc-flip" data-dir="r" aria-label="Next photo" disabled={at >= shown.length - 1} onClick={() => go(1)}><Caret dir="r" s={16} /></button>
          <span className="sc-dots" aria-hidden="true">{shown.map((p, i) => <i key={p.url} data-on={i === at || undefined} />)}</span>
        </>
      )}
    </div>
  )
}

function Rating({ lodging }: { lodging: Lodging }) {
  if (lodging.rating == null) return null
  const label = [`Rated ${dec1(lodging.rating)} of 10`, lodging.reviews ? `from ${thousands(lodging.reviews)} reviews` : '', lodging.rating_source ? `on ${lodging.rating_source}` : '']
    .filter(Boolean)
    .join(' ')
  return <Tip label={label} className="sc-rate"><Star s={11} /><span aria-hidden="true">{dec1(lodging.rating)}</span></Tip>
}

/** The facts of a room as marks: its beds, whether it is your own and its bathroom. */
function RoomMarks({ room }: { room: LodgingRoom }) {
  const marks: ReactNode[] = []
  if (room.beds != null) marks.push(<Tip key="beds" label={room.beds === 1 ? '1 bed' : `${room.beds} beds`} className="sc-mk"><Bed /><span aria-hidden="true">{room.beds}</span></Tip>)
  if (room.private != null) marks.push(<Tip key="own" label={room.private ? 'A room of your own' : 'A shared room'} className="sc-mk" kind={room.private ? 'own' : 'shared'}>{room.private ? <Door /> : <Person />}</Tip>)
  if (room.bathroom) marks.push(<Tip key="bath" label={room.bathroom === 'private' ? 'Its own bathroom' : 'A shared bathroom'} className="sc-mk" kind={room.bathroom}><Bath /></Tip>)
  if (room.notes) marks.push(<Tip key="note" label={room.notes} className="sc-mk"><Note /></Tip>)
  if (!marks.length) return null
  return <span className="sc-rmk">{marks}</span>
}

function Price({ pr }: { pr: StayPrice | null }) {
  if (!pr) return <span className="sc-pr" data-none>{kr(null)}</span>
  if (pr.exact) return <span className="sc-pr"><b>{kr(pr.total)}</b></span>
  return <span className="sc-pr" data-near><b>{kr(pr.total)}</b><small>for {dayRange(pr.check_in, pr.check_out)}</small></span>
}

/** Asks Claude for the prices of the rooms with none for these nights. One press is one task. */
function AskDates({ lodging, rooms, first, nights }: { lodging: Lodging; rooms: LodgingRoom[]; first: string; nights: number }) {
  const journey = useStore((s) => s.journey)
  const [state, setState] = useState<AskState>('idle')
  const [error, setError] = useState('')
  // other nights are another question
  useEffect(() => {
    setState('idle')
    setError('')
  }, [first, nights])
  const ask = async () => {
    if (state === 'sending' || state === 'sent') return
    setState('sending')
    const r = await press('idle', () => insertTask(stayPricesTask(lodging, rooms, first, nights), journey?.id ?? null, journey?.version ?? null))
    setState(r.state)
    setError(r.error)
  }
  return (
    <p className="sc-ask">
      <button type="button" onClick={ask} disabled={state === 'sending' || state === 'sent'} data-state={state}>
        {state === 'idle' ? 'Ask Claude for these dates' : state === 'sent' ? <><Check s={12} />{askLabel(state)}</> : askLabel(state)}
      </button>
      {error && <small role="alert">{error}</small>}
    </p>
  )
}

export interface StayCardProps {
  lodging: Lodging
  /** the first night the rooms are priced for, and how many. Without them the card has no prices */
  first?: string | null
  nights?: number
  /** the booked stay at this place for the stop, when there is one */
  booking?: Booking | null
  /** picks a room. Without it the rooms are only read */
  onChoose?: (roomId: string) => void
  /** the rooms planned for the stop, shown as picked */
  chosen?: string[]
}

export function StayCard({ lodging, first, nights = 0, booking, onChoose, chosen = [] }: StayCardProps) {
  const priced = !!first && nights > 0
  const prices = new Map(lodging.rooms.map((r) => [r.id, priced ? priceFor(r, first!, nights) : null]))
  const unpriced = priced ? lodging.rooms.filter((r) => !prices.get(r.id)?.exact) : []
  const links = lodging.links.filter((l) => safeUrl(l.url))
  const centre = lodging.to_center_km != null ? distance(lodging.to_center_km, 'centre') : null
  const beach = lodging.to_beach_km != null ? distance(lodging.to_beach_km, 'beach') : null
  // the beach as a distance says more than the beach as a tag
  const tags = lodging.tags.filter((t) => !(t === 'beach' && beach))
  const booked = booking?.room_id ?? null
  const hasPhotos = lodging.photos.some((p) => safeUrl(p.url))

  return (
    <article className="sc" data-booked={booking ? true : undefined} aria-label={lodging.name}>
      {booking && (
        <div className="sc-band">
          <Check s={14} />
          <span>Booked</span>
          {booking.reference && <output className="sc-ref" aria-label={`Booking reference ${booking.reference}`}>{booking.reference}</output>}
        </div>
      )}
      {hasPhotos && (
        <div className="sc-top">
          <Photos lodging={lodging} />
          <span className="sc-on-ph"><Rating lodging={lodging} /></span>
        </div>
      )}
      <div className="sc-body">
        <header className="sc-h">
          <h4>{lodging.name}</h4>
          <span className="sc-kind">{KIND[lodging.kind]}</span>
          {!hasPhotos && <Rating lodging={lodging} />}
        </header>

        {(centre || beach || tags.length > 0) && (
          <ul className="sc-facts">
            {centre && <li><Tip label={centre.label} className="sc-mk"><Pin /><span aria-hidden="true">{centre.text}</span></Tip></li>}
            {beach && <li><Tip label={beach.label} className="sc-mk" kind="beach"><Wave /><span aria-hidden="true">{beach.text}</span></Tip></li>}
            {tags.map((t) => <li key={t} className="sc-tag">{TAG[t]}</li>)}
          </ul>
        )}

        {lodging.rooms.length > 0 && (
          <ul className="sc-rooms" aria-label="Rooms">
            {lodging.rooms.map((r) => {
              const on = chosen.includes(r.id) || booked === r.id
              const inner = (
                <>
                  {onChoose && <span className="sc-pick" aria-hidden="true">{on && <Check s={11} />}</span>}
                  <span className="sc-rn">{r.name}</span>
                  {priced && <Price pr={prices.get(r.id) ?? null} />}
                </>
              )
              return (
                <li key={r.id} className="sc-room" data-on={on || undefined} data-booked={booked === r.id || undefined}>
                  {onChoose ? (
                    <button type="button" className="sc-row" aria-pressed={on} onClick={() => onChoose(r.id)}>{inner}</button>
                  ) : <div className="sc-row">{inner}</div>}
                  <RoomMarks room={r} />
                </li>
              )
            })}
          </ul>
        )}
        {unpriced.length > 0 && <AskDates lodging={lodging} rooms={unpriced} first={first!} nights={nights} />}

        {links.length > 0 && (
          <ul className="sc-links">
            {links.map((l) => (
              <li key={l.url}>
                <a href={safeUrl(l.url)!} target="_blank" rel="noopener noreferrer">{linkName(l.site, l.url)}<External s={11} /></a>
              </li>
            ))}
          </ul>
        )}

        {lodging.summary && <p className="sc-sum">{lodging.summary}</p>}
        {lodging.notes && <p className="sc-note"><Note s={13} /><span>{lodging.notes}</span></p>}
      </div>
    </article>
  )
}
